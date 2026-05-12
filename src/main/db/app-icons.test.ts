import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  type AppIconStatements,
  bumpAppIconSyncAttempts,
  getAppIcon,
  getAppIconsForNames,
  getPendingAppIcons,
  markAppIconsFailed,
  markAppIconsSynced,
  prepareAppIconStatements,
  upsertAppIcon,
} from './app-icons';
import { MIGRATIONS } from './migrations';

// Vite can't bundle `node:sqlite` natively, so reach for it via require.
const requireFromHere = createRequire(import.meta.url);
const { DatabaseSync } = requireFromHere('node:sqlite') as {
  DatabaseSync: new (path: string) => unknown;
};

// node:sqlite + a transaction shim stand in for better-sqlite3 in tests so we
// don't depend on better-sqlite3 being built against the system Node version
// (the production binary is built against Electron's Node).
function createTestDb(): Database.Database {
  const raw = new DatabaseSync(':memory:') as unknown as Database.Database & {
    transaction?: unknown;
  };
  const v3 = MIGRATIONS.find((m) => m.version === 3);
  if (!v3) throw new Error('migration v3 not found');
  raw.exec(v3.sql);
  // Production code uses better-sqlite3's `db.transaction(fn)` to wrap a
  // closure in BEGIN/COMMIT. node:sqlite has no equivalent, so the shim
  // returns the closure directly — the test runs serially anyway, and we
  // care about the SQL semantics, not the implicit savepoint.
  raw.transaction = ((fn: (...args: unknown[]) => unknown) =>
    fn) as unknown as Database.Database['transaction'];
  return raw;
}

interface IconCounts {
  pending: number;
  synced: number;
  failed: number;
}

function countByState(db: Database.Database): IconCounts {
  const rows = db
    .prepare(
      `SELECT sync_state AS state, COUNT(*) AS n FROM app_icons GROUP BY sync_state`,
    )
    .all() as { state: string; n: number }[];
  const out: IconCounts = { pending: 0, synced: 0, failed: 0 };
  for (const r of rows) {
    if (r.state === 'pending' || r.state === 'synced' || r.state === 'failed') {
      out[r.state] = r.n;
    }
  }
  return out;
}

describe('app-icons', () => {
  let db: Database.Database;
  let stmts: AppIconStatements;

  beforeEach(() => {
    db = createTestDb();
    stmts = prepareAppIconStatements(db);
  });

  test('upsertAppIcon → getAppIcon round-trips', () => {
    upsertAppIcon(stmts, 'Safari', 'data:image/png;base64,abc', 1000);
    const row = getAppIcon(stmts, 'Safari');
    expect(row).toEqual({
      appName: 'Safari',
      dataUrl: 'data:image/png;base64,abc',
      updatedAt: 1000,
    });
  });

  test('upsert preserves UNIQUE app_name and replaces data_url + bumps updated_at', () => {
    upsertAppIcon(stmts, 'Safari', 'data:v1', 1000);
    upsertAppIcon(stmts, 'Safari', 'data:v2', 2000);
    const row = getAppIcon(stmts, 'Safari');
    expect(row?.dataUrl).toBe('data:v2');
    expect(row?.updatedAt).toBe(2000);
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM app_icons WHERE app_name = 'Safari'`)
      .get() as { n: number };
    expect(total.n).toBe(1);
  });

  test('getAppIconsForNames batch lookup returns map keyed by app name', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    upsertAppIcon(stmts, 'Cursor', 'data:2', 1100);
    upsertAppIcon(stmts, 'Slack', 'data:3', 1200);
    const map = getAppIconsForNames(stmts, ['Safari', 'Cursor', 'Unknown']);
    expect(map.size).toBe(2);
    expect(map.get('Safari')).toEqual({ dataUrl: 'data:1', updatedAt: 1000 });
    expect(map.get('Cursor')).toEqual({ dataUrl: 'data:2', updatedAt: 1100 });
    expect(map.get('Unknown')).toBeUndefined();
  });

  test('empty getAppIconsForNames returns empty map without hitting DB', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    const map = getAppIconsForNames(stmts, []);
    expect(map.size).toBe(0);
  });

  test('newly-upserted rows are pending and visible to getPendingAppIcons', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    upsertAppIcon(stmts, 'Cursor', 'data:2', 1100);
    const pending = getPendingAppIcons(stmts, 5000, 100);
    expect(pending.length).toBe(2);
    expect(pending.map((p) => p.appName).sort()).toEqual(['Cursor', 'Safari']);
    for (const p of pending) {
      expect(p.syncAttempts).toBe(0);
    }
  });

  test('markAppIconsSynced flips state pending → synced', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    upsertAppIcon(stmts, 'Cursor', 'data:2', 1100);
    markAppIconsSynced(
      db,
      stmts,
      [
        { appName: 'Safari', updatedAt: 1000 },
        { appName: 'Cursor', updatedAt: 1100 },
      ],
      9000,
    );
    expect(countByState(db)).toEqual({ pending: 0, synced: 2, failed: 0 });
    expect(getPendingAppIcons(stmts, 9999, 10).length).toBe(0);
  });

  test('markAppIconsSynced is optimistic: skips rows whose updated_at changed', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    // simulate a racing re-upsert that bumps updated_at
    upsertAppIcon(stmts, 'Safari', 'data:2', 2000);
    // attempt to mark synced using the stale updated_at we read first
    markAppIconsSynced(
      db,
      stmts,
      [{ appName: 'Safari', updatedAt: 1000 }],
      9000,
    );
    // row is still pending — race detected, will be picked up next flush
    expect(countByState(db)).toEqual({ pending: 1, synced: 0, failed: 0 });
    const pending = getPendingAppIcons(stmts, 9999, 10);
    expect(pending[0].appName).toBe('Safari');
    expect(pending[0].updatedAt).toBe(2000);
  });

  test('bumpAppIconSyncAttempts pushes next attempt forward and stores error', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    bumpAppIconSyncAttempts(stmts, ['Safari'], 5000, 'transient');
    const pending = getPendingAppIcons(stmts, 4000, 10);
    expect(pending.length).toBe(0);
    const ready = getPendingAppIcons(stmts, 5000, 10);
    expect(ready.length).toBe(1);
    expect(ready[0].syncAttempts).toBe(1);
  });

  test('markAppIconsFailed transitions pending → failed', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    markAppIconsFailed(stmts, ['Safari'], 'permanent');
    expect(countByState(db)).toEqual({ pending: 0, synced: 0, failed: 1 });
    expect(getPendingAppIcons(stmts, 9999, 10).length).toBe(0);
  });

  test('re-upsert after failure resets state back to pending', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    markAppIconsFailed(stmts, ['Safari'], 'oops');
    upsertAppIcon(stmts, 'Safari', 'data:2', 2000);
    expect(countByState(db)).toEqual({ pending: 1, synced: 0, failed: 0 });
  });

  test('re-upsert after sync resets state back to pending so cloud picks up changes', () => {
    upsertAppIcon(stmts, 'Safari', 'data:1', 1000);
    markAppIconsSynced(
      db,
      stmts,
      [{ appName: 'Safari', updatedAt: 1000 }],
      5000,
    );
    upsertAppIcon(stmts, 'Safari', 'data:2', 2000);
    expect(countByState(db)).toEqual({ pending: 1, synced: 0, failed: 0 });
  });
});
