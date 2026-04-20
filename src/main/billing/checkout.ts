import { shell } from 'electron';
import { cloudAuthHeaders, requireCloudEndpoint } from '../cloud/endpoint';

async function fetchUrl(direct: string, supabase: string): Promise<string> {
  const res = await fetch(requireCloudEndpoint(direct, supabase), {
    method: 'POST',
    headers: cloudAuthHeaders(),
  });
  if (!res.ok) {
    // Edge functions return `{ error, message }` on failure (see
    // supabase/functions/_shared/errors.ts). Surface the message so the
    // caller sees e.g. "missing required env var: STRIPE_SECRET_KEY"
    // instead of a bare status code.
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? '';
    } catch {
      // Response wasn't JSON; leave detail empty.
    }
    throw new Error(
      `${direct} failed: ${res.status}${detail ? ` — ${detail}` : ''}`,
    );
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error(`${direct} returned no url`);
  return data.url;
}

export async function openCheckout() {
  await shell.openExternal(await fetchUrl('checkout', 'billing-checkout'));
}

export async function openPortal() {
  await shell.openExternal(await fetchUrl('portal', 'billing-portal'));
}
