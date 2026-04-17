// POST /functions/v1/billing-checkout
//
// Creates a Stripe Checkout session for the $8/mo subscription with a 14-day
// trial (card required up-front). Returns `{ url }` that the client opens via
// shell.openExternal. Success/cancel URLs use the slowblink:// deep link
// scheme so the desktop app gets focus back after checkout.
//
// Customer lookup: if the user already has `profiles.stripe_customer_id` we
// reuse it; otherwise we create a Stripe Customer with `supabase_user_id` in
// metadata (so the webhook can match the customer → profile if we ever lose
// the mapping) and persist the id back to `profiles`.
//
// Contract (matches src/main/billing/checkout.ts):
//   Request:  POST, empty body
//   Response: { url }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type Stripe from 'stripe';
import { getUser } from '../_shared/auth.ts';
import { DEEP_LINKS } from '../_shared/constants.ts';
import { requireEnv } from '../_shared/env.ts';
import { jsonResponse } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const TRIAL_DAYS = 14;

async function getOrCreateCustomer(
  stripe: Stripe,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  const { error: updateError } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (updateError) {
    console.error('failed to persist stripe_customer_id (non-fatal):', updateError);
  }
  return customer.id;
}

Deno.serve(
  withPost(async (req) => {
    const user = await getUser(req);
    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, user.id, user.email);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: requireEnv('STRIPE_PRICE_ID'), quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      success_url: DEEP_LINKS.BILLING_SUCCESS,
      cancel_url: DEEP_LINKS.BILLING_CANCEL,
      // Redundant with customer.metadata but lets the webhook resolve
      // session → user even if the profile update below hasn't landed yet.
      metadata: { supabase_user_id: user.id },
    });

    if (!session.url) throw new Error('stripe returned no url');
    return jsonResponse({ url: session.url });
  }),
);
