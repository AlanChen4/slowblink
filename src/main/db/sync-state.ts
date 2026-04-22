import type Database from 'better-sqlite3';
import type { Category, SyncState } from '../../shared/types';

export interface PendingSampleRow {
  id: number;
  ts: number;
  activity: string;
  category: Category;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
  open_windows: string | null;
  sync_attempts: number;
}

export interface SyncStatements {
  getPending: Database.Statement;
  markSynced: Database.Statement;
  markFailedBatch: Database.Statement;
  bumpAttempts: Database.Statement;
  countByState: Database.Statement;
  resetFailedToPending: Database.Statement;
}

export function prepareSyncStatements(db: Database.Database): SyncStatements {
  return {
    // Only rows whose next-attempt time has arrived — lets us keep exponential
    // backoff without a separate in-memory schedule.
    getPending: db.prepare(
      `SELECT id, ts, activity, category, confidence, focused_app, focused_window, open_windows, sync_attempts
       FROM samples
       WHERE sync_state = 'pending' AND sync_next_attempt_ts <= ?
       ORDER BY ts ASC
       LIMIT ?`,
    ),
    markSynced: db.prepare(
      `UPDATE samples
       SET sync_state = 'synced', sync_ts = ?, sync_error = NULL, server_id = COALESCE(?, server_id)
       WHERE id = ?`,
    ),
    markFailedBatch: db.prepare(
      `UPDATE samples
       SET sync_state = 'failed', sync_error = ?
       WHERE id IN (SELECT value FROM json_each(?))`,
    ),
    bumpAttempts: db.prepare(
      `UPDATE samples
       SET sync_attempts = sync_attempts + 1,
           sync_next_attempt_ts = ?,
           sync_error = ?
       WHERE id IN (SELECT value FROM json_each(?))`,
    ),
    countByState: db.prepare(
      `SELECT sync_state AS state, COUNT(*) AS n FROM samples GROUP BY sync_state`,
    ),
    resetFailedToPending: db.prepare(
      `UPDATE samples
       SET sync_state = 'pending', sync_attempts = 0, sync_next_attempt_ts = 0, sync_error = NULL
       WHERE sync_state = 'failed'`,
    ),
  };
}

export function getPendingSamples(
  stmts: SyncStatements,
  now: number,
  limit: number,
): PendingSampleRow[] {
  return stmts.getPending.all(now, limit) as PendingSampleRow[];
}

export function markSamplesSynced(
  db: Database.Database,
  stmts: SyncStatements,
  ids: number[],
  serverIds: Record<number, string | null>,
  syncTs: number,
) {
  const run = db.transaction(() => {
    for (const id of ids) {
      stmts.markSynced.run(syncTs, serverIds[id] ?? null, id);
    }
  });
  run();
}

export function bumpBatchAttempts(
  stmts: SyncStatements,
  ids: number[],
  nextAttemptTs: number,
  error: string,
) {
  stmts.bumpAttempts.run(nextAttemptTs, error, JSON.stringify(ids));
}

export function markBatchFailed(
  stmts: SyncStatements,
  ids: number[],
  error: string,
) {
  stmts.markFailedBatch.run(error, JSON.stringify(ids));
}

export interface SyncCounts {
  pending: number;
  synced: number;
  failed: number;
}

export function countSamplesByState(stmts: SyncStatements): SyncCounts {
  const rows = stmts.countByState.all() as { state: SyncState; n: number }[];
  const counts: SyncCounts = { pending: 0, synced: 0, failed: 0 };
  for (const row of rows) {
    if (row.state in counts) counts[row.state] = row.n;
  }
  return counts;
}
