// POST /functions/v1/ingest
//
// Upsert a batch of samples from the client's local SQLite. The client is
// source of truth; we dedupe on (user_id, client_id) so retries are safe.
//
// Contract (matches src/main/sync/ingest-client.ts):
//   Request:  { samples: Array<SamplePayload> }      (≤200)
//   Response: { accepted: [{ client_id, server_id }],
//               rejected?: [{ client_id, reason }] }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUser } from '../_shared/auth.ts';
import { TIERS, type Tier } from '../_shared/constants.ts';
import { withPost } from '../_shared/handlers.ts';
import { jsonResponse, RateLimitError, ValidationError } from '../_shared/errors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const MAX_BATCH = 200;
const DAILY_ROW_CAP = 20_000;
const FREE_TIER_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SamplePayload {
  client_id: string;
  ts: string;
  activity: string;
  category: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
  open_windows: unknown;
}

function validateBody(body: unknown): SamplePayload[] {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be json object');
  const samples = (body as { samples?: unknown }).samples;
  if (!Array.isArray(samples)) throw new ValidationError('samples must be an array');
  if (samples.length === 0) throw new ValidationError('samples is empty');
  if (samples.length > MAX_BATCH) {
    throw new ValidationError(`batch too large (max ${MAX_BATCH})`);
  }
  return samples as SamplePayload[];
}

function rowShapeError(sample: SamplePayload): string | null {
  if (typeof sample.client_id !== 'string' || !sample.client_id) return 'missing_client_id';
  if (typeof sample.ts !== 'string' || !sample.ts) return 'missing_ts';
  if (Number.isNaN(Date.parse(sample.ts))) return 'invalid_ts';
  if (typeof sample.activity !== 'string') return 'missing_activity';
  if (typeof sample.category !== 'string') return 'missing_category';
  return null;
}

interface SplitRows {
  valid: Array<SamplePayload & { user_id: string }>;
  rejected: Array<{ client_id: string; reason: string }>;
}

function splitValidRows(userId: string, samples: SamplePayload[]): SplitRows {
  const valid: SplitRows['valid'] = [];
  const rejected: SplitRows['rejected'] = [];
  for (const sample of samples) {
    const reason = rowShapeError(sample);
    if (reason) {
      rejected.push({ client_id: String(sample.client_id ?? ''), reason });
      continue;
    }
    valid.push({ ...sample, user_id: userId });
  }
  return { valid, rejected };
}

async function enforceDailyCap(
  admin: SupabaseClient,
  userId: string,
  batchSize: number,
): Promise<void> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await admin
    .from('samples')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('inserted_at', since);
  if (error) throw new Error(`daily cap check failed: ${error.message}`);
  if ((count ?? 0) + batchSize > DAILY_ROW_CAP) {
    throw new RateLimitError('daily_row_cap_exceeded');
  }
}

async function trimFreeTierSamples(admin: SupabaseClient, userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - FREE_TIER_RETENTION_DAYS * DAY_MS).toISOString();
  await admin.from('samples').delete().eq('user_id', userId).lt('inserted_at', cutoff);
}

async function resolveServerIds(
  admin: SupabaseClient,
  userId: string,
  valid: SplitRows['valid'],
  inserted: Array<{ id: string; client_id: string }>,
): Promise<Array<{ client_id: string; server_id: string }>> {
  const idMap = new Map<string, string>();
  for (const row of inserted) idMap.set(row.client_id, row.id);

  // Rows not returned by `upsert(..., ignoreDuplicates: true)` are pre-existing.
  // Fetch their server ids in a single round-trip instead of per-row.
  const missingClientIds = valid
    .filter((row) => !idMap.has(row.client_id))
    .map((row) => row.client_id);

  if (missingClientIds.length > 0) {
    const { data: existing, error } = await admin
      .from('samples')
      .select('id, client_id')
      .eq('user_id', userId)
      .in('client_id', missingClientIds);
    if (error) throw new Error(`duplicate lookup failed: ${error.message}`);
    for (const row of existing ?? []) idMap.set(row.client_id, row.id);
  }

  const accepted: Array<{ client_id: string; server_id: string }> = [];
  for (const row of valid) {
    const serverId = idMap.get(row.client_id);
    if (serverId) accepted.push({ client_id: row.client_id, server_id: serverId });
  }
  return accepted;
}

Deno.serve(
  withPost(async (req) => {
    const user = await getUser(req);
    const samples = validateBody(await req.json().catch(() => null));
    const { valid, rejected } = splitValidRows(user.id, samples);

    if (valid.length === 0) {
      return jsonResponse({ accepted: [], rejected });
    }

    const admin = supabaseAdmin();

    // Single profile read: feeds both the cap check's tier semantics (implicit)
    // and the retention trim decision, so paid users don't pay for the tier
    // lookup on every ingest.
    const { data: profile } = await admin
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single();
    const tier = (profile?.tier ?? TIERS.FREE) as Tier;

    await enforceDailyCap(admin, user.id, valid.length);

    const { data: inserted, error } = await admin
      .from('samples')
      .upsert(valid, { onConflict: 'user_id,client_id', ignoreDuplicates: true })
      .select('id, client_id');
    if (error) throw new Error(`ingest upsert failed: ${error.message}`);

    const accepted = await resolveServerIds(admin, user.id, valid, inserted ?? []);

    // Fire-and-forget retention trim for free users — doesn't block the response.
    if (tier === TIERS.FREE) {
      trimFreeTierSamples(admin, user.id).catch((err) => {
        console.error('retention trim failed (non-fatal):', err);
      });
    }

    return jsonResponse({ accepted, rejected });
  }),
);
