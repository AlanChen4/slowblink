// POST /functions/v1/billing-portal
//
// Creates a Stripe Customer Portal session. The user must already have a
// `profiles.stripe_customer_id` (i.e. have opened Checkout at least once).
// Return URL uses slowblink:// so the app refocuses after they close the
// portal.
//
// Contract (matches src/main/billing/checkout.ts::openPortal):
//   Request:  POST, empty body
//   Response: { url }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUser } from '../_shared/auth.ts';
import { DEEP_LINKS } from '../_shared/constants.ts';
import { jsonResponse, ValidationError } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(
  withPost(async (req) => {
    const user = await getUser(req);

    const { data: profile, error } = await supabaseAdmin()
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    if (!profile?.stripe_customer_id) {
      throw new ValidationError('no_stripe_customer');
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: DEEP_LINKS.SETTINGS,
    });

    return jsonResponse({ url: session.url });
  }),
);
