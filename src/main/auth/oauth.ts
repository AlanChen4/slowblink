import { shell } from 'electron';
import { env } from '../env';
import { getSupabase, missingSupabaseEnvVars } from './client';

// Supabase redirects the browser here after Google consent. The edge
// function responds with an HTML page that deep-links into Electron and
// closes the tab — avoids leaving the user on a "can't reach site" screen
// for the custom `slowblink://` scheme. See supabase/functions/auth-callback.
function authCallbackUrl(): string {
  const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${base}/functions/v1/auth-callback`;
}

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const missing = missingSupabaseEnvVars().join(', ');
    throw new Error(
      `Cloud features are not configured — missing ${missing}. Set via Doppler (doppler secrets set) or .env.local.`,
    );
  }
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authCallbackUrl(),
      skipBrowserRedirect: true,
    },
  });
  if (error) throw new Error(`Google sign-in failed: ${error.message}`);
  if (!data?.url) throw new Error('Google sign-in did not return a URL');
  await shell.openExternal(data.url);
}
