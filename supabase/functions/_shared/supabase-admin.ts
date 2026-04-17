// Service-role Supabase client. Only imported from inside edge functions,
// never exposed to the Electron client.
//
// The factory pattern (not a module-level singleton) makes each invocation
// cheap to cold-start because createClient() is ~synchronous and we're
// running under edge_runtime.policy = "oneshot" anyway.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env.ts';

export function supabaseAdmin(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
