import { shell } from 'electron';
import { getSupabase, missingSupabaseEnvVars } from './client';
import { PROTOCOL } from './deep-link';

const REDIRECT_URL = `${PROTOCOL}://auth/callback`;

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
      redirectTo: REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw new Error(`Google sign-in failed: ${error.message}`);
  if (!data?.url) throw new Error('Google sign-in did not return a URL');
  await shell.openExternal(data.url);
}
