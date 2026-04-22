// Shared Stripe factory. Not pinning apiVersion so the SDK uses its own
// default (stripe-node 17.x → 2024-09-30.acacia). A drift-free single
// source of truth matters less than avoiding the footgun where a manually
// pinned version that doesn't match the SDK's allowed literal union is
// either rejected at boot (strict Deno type-check) or at runtime
// ("Invalid Stripe API version"). When we want to upgrade, bump the SDK.

import Stripe from 'stripe';
import { requireEnv } from './env.ts';

export function getStripe(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'));
}
