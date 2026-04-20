import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

let client: SupabaseClient | null = null;

export function missingSupabaseEnvVars(): string[] {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  return missing;
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
