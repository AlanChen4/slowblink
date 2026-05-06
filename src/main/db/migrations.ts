import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        activity TEXT NOT NULL,
        confidence REAL,
        focused_app TEXT,
        focused_window TEXT,
        sync_state TEXT NOT NULL DEFAULT 'pending',
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        sync_next_attempt_ts INTEGER NOT NULL DEFAULT 0,
        sync_ts INTEGER,
        sync_error TEXT,
        server_id TEXT
      );
      CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts);
      CREATE INDEX IF NOT EXISTS samples_sync ON samples(sync_state, ts);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS dev_captures (
        id TEXT PRIMARY KEY,
        sample_id INTEGER,
        captured_at INTEGER NOT NULL,
        request_started_at INTEGER,
        response_received_at INTEGER,
        provider TEXT NOT NULL,
        model TEXT,
        outcome TEXT NOT NULL,
        error_message TEXT,
        focused_app TEXT,
        focused_window TEXT,
        image_size_bytes INTEGER,
        request_json TEXT,
        response_json TEXT,
        parsed_result_json TEXT
      );
      CREATE INDEX IF NOT EXISTS dev_captures_captured_at ON dev_captures(captured_at DESC);
      CREATE INDEX IF NOT EXISTS dev_captures_outcome ON dev_captures(outcome, captured_at DESC);
    `,
  },
];

export function runMigrations(db: Database.Database) {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > current);
  for (const migration of pending) {
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }
}
