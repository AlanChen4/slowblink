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
