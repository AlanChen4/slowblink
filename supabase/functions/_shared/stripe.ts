// Shared Stripe factory. Pinning the API version in one place means API
// upgrades are a single-file change; a drifting apiVersion across handlers
// would silently split behavior between checkout, portal, and webhook.

import Stripe from 'stripe';
import { requireEnv } from './env.ts';

// Stripe API versions since late-2024 carry a release-label suffix
// (`.acacia` for 2024-11-20, `.basil` for the 2025-03-31 release, etc.).
// A bare `YYYY-MM-DD` string is rejected at runtime as "Invalid Stripe
// API version" even though TypeScript accepts it.
export const STRIPE_API_VERSION = '2024-11-20.acacia' as const;

export function getStripe(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
}
