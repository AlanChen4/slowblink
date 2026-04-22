// POST /functions/v1/delete-all
//
// Deletes every row in `public.samples` owned by the authenticated user.
// Does NOT touch `profiles` (billing state) or the Stripe customer — the
// user can still upgrade/downgrade after a wipe.
//
// Called from the Settings "Delete all data" confirm flow. The client also
// wipes local SQLite afterwards; this function just handles the cloud side.
//
// Contract:
//   Request:  POST, empty body
//   Response: { deleted: number }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUser } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(
  withPost(async (req) => {
    const user = await getUser(req);

    const { count, error } = await supabaseAdmin()
      .from('samples')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);
    if (error) throw new Error(`delete failed: ${error.message}`);

    return jsonResponse({ deleted: count ?? 0 });
  }),
);
