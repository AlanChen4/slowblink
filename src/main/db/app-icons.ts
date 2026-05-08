import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface AppIconRow {
  appName: string;
  dataUrl: string;
  updatedAt: number;
}

export interface PendingAppIconRow {
  appName: string;
  dataUrl: string;
  updatedAt: number;
  syncAttempts: number;
}

export interface AppIconStatements {
  upsert: Database.Statement;
  getByName: Database.Statement;
  getByNames: Database.Statement;
  getPending: Database.Statement;
  markSyncedIfUnchanged: Database.Statement;
  markFailedBatch: Database.Statement;
  bumpAttempts: Database.Statement;
  deleteAll: Database.Statement;
}

export function prepareAppIconStatements(
  db: Database.Database,
): AppIconStatements {
  return {
    upsert: db.prepare(
      `INSERT INTO app_icons (id, app_name, data_url, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(app_name) DO UPDATE SET
         data_url = excluded.data_url,
         updated_at = excluded.updated_at,
         sync_state = 'pending',
         sync_attempts = 0,
         sync_next_attempt_ts = 0,
         sync_error = NULL`,
    ),
    getByName: db.prepare(
      `SELECT app_name, data_url, updated_at FROM app_icons WHERE app_name = ?`,
    ),
    getByNames: db.prepare(
      `SELECT app_name, data_url, updated_at FROM app_icons
       WHERE app_name IN (SELECT value FROM json_each(?))`,
    ),
    getPending: db.prepare(
      `SELECT app_name, data_url, updated_at, sync_attempts FROM app_icons
       WHERE sync_state = 'pending' AND sync_next_attempt_ts <= ?
       ORDER BY updated_at ASC
       LIMIT ?`,
    ),
    // Optimistic concurrency: only mark synced if updated_at hasn't changed
    // since we read it. A racing re-upsert resets sync_state='pending' and
    // bumps updated_at, so this WHERE clause leaves that row alone for the
    // next flush to pick up.
    markSyncedIfUnchanged: db.prepare(
      `UPDATE app_icons
       SET sync_state = 'synced', sync_ts = ?, sync_error = NULL
       WHERE app_name = ? AND updated_at = ?`,
    ),
    markFailedBatch: db.prepare(
      `UPDATE app_icons
       SET sync_state = 'failed', sync_error = ?
       WHERE app_name IN (SELECT value FROM json_each(?))`,
    ),
    bumpAttempts: db.prepare(
      `UPDATE app_icons
       SET sync_attempts = sync_attempts + 1,
           sync_next_attempt_ts = ?,
           sync_error = ?
       WHERE app_name IN (SELECT value FROM json_each(?))`,
    ),
    deleteAll: db.prepare(`DELETE FROM app_icons`),
  };
}

interface AppIconDbRow {
  app_name: string;
  data_url: string;
  updated_at: number;
}

interface PendingAppIconDbRow {
  app_name: string;
  data_url: string;
  updated_at: number;
  sync_attempts: number;
}

export function upsertAppIcon(
  stmts: AppIconStatements,
  appName: string,
  dataUrl: string,
  now: number,
): void {
  stmts.upsert.run(randomUUID(), appName, dataUrl, now);
}

export function getAppIcon(
  stmts: AppIconStatements,
  appName: string,
): AppIconRow | null {
  const row = stmts.getByName.get(appName) as AppIconDbRow | undefined;
  if (!row) return null;
  return {
    appName: row.app_name,
    dataUrl: row.data_url,
    updatedAt: row.updated_at,
  };
}

export function getAppIconsForNames(
  stmts: AppIconStatements,
  names: string[],
): Map<string, { dataUrl: string; updatedAt: number }> {
  const out = new Map<string, { dataUrl: string; updatedAt: number }>();
  if (names.length === 0) return out;
  const rows = stmts.getByNames.all(JSON.stringify(names)) as AppIconDbRow[];
  for (const row of rows) {
    out.set(row.app_name, {
      dataUrl: row.data_url,
      updatedAt: row.updated_at,
    });
  }
  return out;
}

export function getPendingAppIcons(
  stmts: AppIconStatements,
  now: number,
  limit: number,
): PendingAppIconRow[] {
  const rows = stmts.getPending.all(now, limit) as PendingAppIconDbRow[];
  return rows.map((r) => ({
    appName: r.app_name,
    dataUrl: r.data_url,
    updatedAt: r.updated_at,
    syncAttempts: r.sync_attempts,
  }));
}

export function markAppIconsSynced(
  db: Database.Database,
  stmts: AppIconStatements,
  rows: { appName: string; updatedAt: number }[],
  syncTs: number,
): void {
  const run = db.transaction(() => {
    for (const row of rows) {
      stmts.markSyncedIfUnchanged.run(syncTs, row.appName, row.updatedAt);
    }
  });
  run();
}

export function bumpAppIconSyncAttempts(
  stmts: AppIconStatements,
  names: string[],
  nextAttemptTs: number,
  error: string,
): void {
  if (names.length === 0) return;
  stmts.bumpAttempts.run(nextAttemptTs, error, JSON.stringify(names));
}

export function markAppIconsFailed(
  stmts: AppIconStatements,
  names: string[],
  error: string,
): void {
  if (names.length === 0) return;
  stmts.markFailedBatch.run(error, JSON.stringify(names));
}
