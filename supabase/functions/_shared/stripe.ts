// Shared Stripe factory. Pinning the API version in one place means API
// upgrades are a single-file change; a drifting apiVersion across handlers
// would silently split behavior between checkout, portal, and webhook.

import Stripe from 'stripe';
import { requireEnv } from './env.ts';

export const STRIPE_API_VERSION = '2024-11-20' as const;

export function getStripe(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
}
