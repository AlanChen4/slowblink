// Shared CORS headers for edge functions.
// The Electron renderer doesn't hit these directly (it goes through the
// main process), but `supabase functions serve` local tests and the Stripe
// CLI webhook forwarder benefit from permissive CORS.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
