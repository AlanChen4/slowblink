// Shared constants for tiers and deep-link URLs.
// The Electron app registers `slowblink://` as a protocol handler; these URLs
// must match `app.setAsDefaultProtocolClient('slowblink')` + the routes that
// main/auth/deep-link.ts listens for.

export type Tier = 'free' | 'paid';

export const TIERS = {
  FREE: 'free' as const satisfies Tier,
  PAID: 'paid' as const satisfies Tier,
};

export const DEEP_LINKS = {
  BILLING_SUCCESS: 'slowblink://billing/success',
  BILLING_CANCEL: 'slowblink://billing/cancel',
  SETTINGS: 'slowblink://settings',
} as const;
