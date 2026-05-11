import { getSupabase } from '../auth/client';
import { getCurrentSession } from '../auth/session';
import {
  bumpAppIconSyncAttempts,
  getPendingAppIcons,
  markAppIconsFailed,
  markAppIconsSynced,
  type PendingAppIconRow,
} from '../db';
import { AuthRequiredError } from './ingest-client';

const MAX_BATCH_SIZE = 100;

export interface AppIconsUploadResult {
  attempted: number;
  uploaded: number;
}

export async function uploadPendingAppIcons(
  backoffFor: (attempts: number) => number,
): Promise<AppIconsUploadResult> {
  const now = Date.now();
  const rows = getPendingAppIcons(now, MAX_BATCH_SIZE);
  if (rows.length === 0) return { attempted: 0, uploaded: 0 };

  const session = getCurrentSession();
  if (!session) throw new AuthRequiredError('No session');

  const userId = session.user.id;
  const client = getSupabase();
  if (!client) throw new AuthRequiredError('Supabase is not configured');

  const payload = rows.map((r) => ({
    user_id: userId,
    app_name: r.appName,
    data_url: r.dataUrl,
    updated_at: new Date(r.updatedAt).toISOString(),
  }));

  const { error, status } = await client
    .from('app_icons')
    .upsert(payload, { onConflict: 'user_id,app_name' });

  const names = rows.map((r) => r.appName);
  if (error) {
    handleUploadError(rows, names, status, error.message, backoffFor);
    return { attempted: rows.length, uploaded: 0 };
  }

  markAppIconsSynced(
    rows.map((r) => ({ appName: r.appName, updatedAt: r.updatedAt })),
    Date.now(),
  );
  return { attempted: rows.length, uploaded: rows.length };
}

function handleUploadError(
  rows: PendingAppIconRow[],
  names: string[],
  status: number,
  message: string,
  backoffFor: (attempts: number) => number,
): void {
  if (status === 401 || status === 403) {
    throw new AuthRequiredError(`app_icons auth rejected (${status})`);
  }
  if (status === 429) {
    applyBackoff(rows, message, backoffFor);
    return;
  }
  if (status >= 400 && status < 500) {
    markAppIconsFailed(names, message);
    return;
  }
  applyBackoff(rows, message, backoffFor);
}

function applyBackoff(
  rows: PendingAppIconRow[],
  message: string,
  backoffFor: (attempts: number) => number,
): void {
  const now = Date.now();
  const buckets = new Map<number, string[]>();
  for (const row of rows) {
    const attempts = row.syncAttempts + 1;
    const list = buckets.get(attempts) ?? [];
    list.push(row.appName);
    buckets.set(attempts, list);
  }
  for (const [attempts, namesForBucket] of buckets) {
    bumpAppIconSyncAttempts(
      namesForBucket,
      now + backoffFor(attempts),
      message,
    );
  }
}
