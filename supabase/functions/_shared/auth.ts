// Auth helpers used by every JWT-verified edge function.
//
// Even though config.toml sets `verify_jwt = true` (which makes the platform
// reject missing/expired tokens before our handler runs), we re-derive the
// user via the service-role client so the handler has the user row and so
// tests that bypass the platform (e.g. local Deno test harness) still work.

import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-admin.ts';
import { TIERS } from './constants.ts';
import { AuthError, PlanError } from './errors.ts';

export async function getUser(req: Request): Promise<User> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AuthError('missing_token');

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new AuthError('invalid_token');
  return data.user;
}

export async function requirePaid(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('tier')
    .eq('id', userId)
    .single();

  if (error) throw new PlanError('plan_lookup_failed');
  if (data?.tier !== TIERS.PAID) throw new PlanError('paid_required');
}
