import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Integration test: hits the local Supabase Postgres via service role.
// Skips cleanly when the local stack isn't reachable so CI stays green;
// run with `pnpm db:start` (and Doppler/`supabase/.env`) to exercise it.

function getLocalCredentials(): { url: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

const credentials = getLocalCredentials();

describe.runIf(credentials !== null)(
  'ingest_samples_with_cap RPC (requires pnpm db:start)',
  () => {
    if (!credentials) throw new Error('unreachable: gated by describe.runIf');
    const admin = createClient(credentials.url, credentials.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const email = `ingest-rpc-test-${suffix}@example.local`;
      const password = `rpc-test-${Math.random().toString(36).slice(2)}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(
          `createUser failed: ${error?.message ?? 'no user returned'}`,
        );
      }
      userId = data.user.id;
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it('inserts one row and returns its server id without raising column ambiguity', async () => {
      const { data, error } = await admin.rpc('ingest_samples_with_cap', {
        p_user_id: userId,
        p_rows: [
          {
            client_id: 'rpc-test-1',
            ts: new Date().toISOString(),
            activity: 'work',
            confidence: null,
            focused_app: null,
            focused_window: null,
          },
        ],
        p_cap: 100,
      });

      expect(error).toBeNull();
      const rows = (data ?? []) as { id: string; client_id: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].client_id).toBe('rpc-test-1');
      expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });
  },
);
