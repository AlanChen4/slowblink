import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS samples (
          id INTEGER PRIMARY KEY,
          ts INTEGER NOT NULL,
          activity TEXT NOT NULL,
          category TEXT NOT NULL,
          confidence REAL,
          focused_app TEXT,
          focused_window TEXT,
          open_windows TEXT
        );
        CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts);
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        ALTER TABLE samples ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending';
        ALTER TABLE samples ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE samples ADD COLUMN sync_next_attempt_ts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE samples ADD COLUMN sync_ts INTEGER;
        ALTER TABLE samples ADD COLUMN sync_error TEXT;
        ALTER TABLE samples ADD COLUMN server_id TEXT;
        CREATE INDEX IF NOT EXISTS samples_sync ON samples(sync_state, ts);
      `);
    },
  },
];

export function runMigrations(db: Database.Database) {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > current);
  for (const migration of pending) {
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }
}
