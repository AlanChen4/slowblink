// Shared handler wrapper for JWT-authenticated JSON edge functions.
//
// Every JSON handler had the same three concerns: CORS preflight, POST-only
// method check, and a try/catch that routes through errorResponse(). Wrapping
// them here means each handler is just its business logic.
//
// Not used by stripe-webhook — that function returns plain text, skips CORS,
// and maps signature errors to 400 directly.

import { corsHeaders, handlePreflight } from './cors.ts';
import { errorResponse } from './errors.ts';

export type PostHandler = (req: Request) => Promise<Response>;

export function withPost(handler: PostHandler): (req: Request) => Promise<Response> {
  return async (req) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
