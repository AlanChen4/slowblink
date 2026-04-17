import { shell } from 'electron';
import { getSupabase } from './client';
import { PROTOCOL } from './deep-link';

const REDIRECT_URL = `${PROTOCOL}://auth/callback`;

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud features are not configured');
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
