import { getAccessToken } from '../auth/session';
import { env } from '../env';

export function cloudEndpoint(
  directPath: string,
  supabasePath: string,
): string | null {
  const base = env.SLOWBLINK_API_BASE ?? env.SUPABASE_URL;
  if (!base) return null;
  const trimmed = base.replace(/\/$/, '');
  const path = env.SLOWBLINK_API_BASE
    ? `/${directPath}`
    : `/functions/v1/${supabasePath}`;
  return `${trimmed}${path}`;
}

export function requireCloudEndpoint(
  directPath: string,
  supabasePath: string,
): string {
  const url = cloudEndpoint(directPath, supabasePath);
  if (!url) throw new Error('Cloud features are not configured');
  return url;
}

export function cloudAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  };
  if (env.SUPABASE_ANON_KEY && !env.SLOWBLINK_API_BASE) {
    headers.apikey = env.SUPABASE_ANON_KEY;
  }
  return headers;
}
