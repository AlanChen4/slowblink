import { shell } from 'electron';
import { cloudAuthHeaders, requireCloudEndpoint } from '../cloud/endpoint';

async function fetchUrl(direct: string, supabase: string): Promise<string> {
  const res = await fetch(requireCloudEndpoint(direct, supabase), {
    method: 'POST',
    headers: cloudAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`${direct} failed: ${res.status}`);
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
