import { net } from 'electron';
import { cloudAuthHeaders, requireCloudEndpoint } from '../cloud/endpoint';
import type { PendingSampleRow } from '../db';

interface IngestRequestRow {
  client_id: string;
  ts: string;
  activity: string;
  category: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
  open_windows: unknown;
}

interface IngestResponse {
  accepted: { client_id: string; server_id: string }[];
  rejected?: { client_id: string; reason: string }[];
}

export interface IngestResult {
  serverIds: Record<number, string | null>;
  rejectedIds: number[];
  rejectedReasons: Record<number, string>;
}

export class PermanentIngestError extends Error {}
export class TransientIngestError extends Error {}
export class AuthRequiredError extends Error {}

function safeParseOpenWindows(raw: string | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function rowToPayload(row: PendingSampleRow): IngestRequestRow {
  return {
    client_id: String(row.id),
    ts: new Date(row.ts).toISOString(),
    activity: row.activity,
    category: row.category,
    confidence: row.confidence,
    focused_app: row.focused_app,
    focused_window: row.focused_window,
    open_windows: safeParseOpenWindows(row.open_windows),
  };
}

async function sendRequest(rows: PendingSampleRow[]): Promise<Response> {
  let headers: Record<string, string>;
  try {
    headers = cloudAuthHeaders();
  } catch {
    throw new AuthRequiredError('No access token');
  }
  try {
    return await net.fetch(requireCloudEndpoint('ingest', 'ingest'), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ samples: rows.map(rowToPayload) }),
    });
  } catch (err) {
    throw new TransientIngestError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError(`ingest auth rejected (${response.status})`);
  }
  if (response.status < 500) {
    throw new PermanentIngestError(
      `ingest rejected ${response.status}: ${text}`,
    );
  }
  throw new TransientIngestError(`ingest failed ${response.status}: ${text}`);
}

function parseAccepted(
  accepted: { client_id: string; server_id: string }[] | undefined,
): Record<number, string | null> {
  const serverIds: Record<number, string | null> = {};
  for (const a of accepted ?? []) {
    const id = Number(a.client_id);
    if (!Number.isNaN(id)) serverIds[id] = a.server_id ?? null;
  }
  return serverIds;
}

function parseRejected(
  rejected: { client_id: string; reason: string }[] | undefined,
): { rejectedIds: number[]; rejectedReasons: Record<number, string> } {
  const rejectedIds: number[] = [];
  const rejectedReasons: Record<number, string> = {};
  for (const r of rejected ?? []) {
    const id = Number(r.client_id);
    if (Number.isNaN(id)) continue;
    rejectedIds.push(id);
    rejectedReasons[id] = r.reason;
  }
  return { rejectedIds, rejectedReasons };
}

function parseResult(
  rows: PendingSampleRow[],
  parsed: IngestResponse | null,
): IngestResult {
  if (!parsed) {
    const serverIds: Record<number, string | null> = {};
    for (const r of rows) serverIds[r.id] = null;
    return { serverIds, rejectedIds: [], rejectedReasons: {} };
  }
  return {
    serverIds: parseAccepted(parsed.accepted),
    ...parseRejected(parsed.rejected),
  };
}

export async function postIngestBatch(
  rows: PendingSampleRow[],
): Promise<IngestResult> {
  const response = await sendRequest(rows);
  await assertOk(response);
  const parsed = (await response
    .json()
    .catch(() => null)) as IngestResponse | null;
  return parseResult(rows, parsed);
}
