// POST /functions/v1/stripe-webhook
//
// Receives Stripe webhook events, verifies the signature, and updates
// `profiles.tier` / `profiles.renews_at`. Uses `stripe_events.id` as an
// idempotency key — a replay returns 200 ok without side effects.
//
// JWT verification is disabled (see config.toml: `[functions.stripe-webhook]
// verify_jwt = false`) because the Stripe signature is the auth.
//
// Events handled:
//   - checkout.session.completed        → link profile ↔ stripe customer
//   - customer.subscription.created     → tier='paid' (or 'free' if not active)
//   - customer.subscription.updated     → tier derived from status
//   - customer.subscription.deleted     → tier='free'
//
// All other events are acknowledged (200) but ignored.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'stripe';
import { TIERS, type Tier } from '../_shared/constants.ts';
import { requireEnv } from '../_shared/env.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const stripe = getStripe();

// Stripe's Node SDK uses Node crypto by default. On Deno edge we need the
// Web Crypto subtle provider, which SDK v14+ exposes via createSubtleCryptoProvider.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

type SubscriptionEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted';

function isSubscriptionEvent(type: string): type is SubscriptionEventType {
  return (
    type === 'customer.subscription.created' ||
    type === 'customer.subscription.updated' ||
    type === 'customer.subscription.deleted'
  );
}

function deriveTier(
  eventType: SubscriptionEventType,
  status: Stripe.Subscription.Status,
): Tier {
  if (eventType === 'customer.subscription.deleted') return TIERS.FREE;
  return status === 'active' || status === 'trialing' ? TIERS.PAID : TIERS.FREE;
}

async function recordEventIdempotent(event: Stripe.Event): Promise<'new' | 'replay'> {
  const { error } = await supabaseAdmin().from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!error) return 'new';
  // 23505 = unique_violation → we've already processed this event.
  if ((error as { code?: string }).code === '23505') return 'replay';
  throw new Error(`stripe_events insert failed: ${error.message}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const supabaseUserId = session.metadata?.supabase_user_id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!supabaseUserId || !customerId) {
    console.warn('checkout.session.completed missing supabase_user_id or customer:', session.id);
    return;
  }

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supabaseUserId);
  if (error) throw new Error(`profiles update failed: ${error.message}`);
}

async function handleSubscriptionEvent(
  eventType: SubscriptionEventType,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const tier = deriveTier(eventType, sub.status);
  const renewsAt = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({
      tier,
      renews_at: renewsAt,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);
  if (error) throw new Error(`profiles update failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  // constructEventAsync relies on the raw body — do NOT JSON.parse first.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET'),
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(`bad signature: ${message}`, { status: 400 });
  }

  try {
    const status = await recordEventIdempotent(event);
    if (status === 'replay') {
      // Already processed — acknowledge but do nothing.
      return new Response('ok', { status: 200 });
    }

    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (isSubscriptionEvent(event.type)) {
      await handleSubscriptionEvent(event.type, event.data.object as Stripe.Subscription);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('stripe-webhook handler error:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(`handler error: ${message}`, { status: 500 });
  }
});
