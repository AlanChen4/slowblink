/**
 * Dev CLI: insert sample data into the local Electron DB so the Overview UI
 * has known data to render.
 *
 * Usage:
 *   pnpm overview:seed --profile=<name>             insert a built-in profile
 *   pnpm overview:seed --from-file=<path>           insert exported samples
 *   pnpm overview:seed --from-file=<path> --force   overwrite a non-empty DB
 *
 * Available profiles: coding-day, mixed-day, browser-heavy, idle-gaps, dlp
 *
 * Quit slowblink before running — SQLite doesn't tolerate a second writer on
 * the same file.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../src/main/db/migrations';
import {
  seedBrowserHeavyDay,
  seedCodingDay,
  seedDlpBlocked,
  seedIdleGaps,
  seedMixedDay,
} from '../src/main/overview/testing/seeds';
import type { Sample } from '../src/shared/types';
import { resolveDbPath } from './db-path';

const PROFILES: Record<string, () => Sample[]> = {
  'coding-day': () => seedCodingDay(),
  'mixed-day': () => seedMixedDay(),
  'browser-heavy': () => seedBrowserHeavyDay(),
  'idle-gaps': () => seedIdleGaps(),
  dlp: () => seedDlpBlocked(),
};

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface ExportedSample {
  ts: number;
  activity: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
}

function loadFromFile(path: string): Sample[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as ExportedSample[];
  if (!Array.isArray(parsed)) {
    console.error('export file is not a JSON array');
    process.exit(1);
  }
  return parsed.map((row, i) => ({
    id: i + 1,
    ts: row.ts,
    activity: row.activity,
    confidence: row.confidence ?? 0,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
  }));
}

function pickSamples(): { samples: Sample[]; label: string } {
  const fromFile = getArg('from-file');
  if (fromFile) {
    return { samples: loadFromFile(fromFile), label: `file:${fromFile}` };
  }
  const profile = getArg('profile');
  if (!profile) {
    console.error(
      `Missing --profile=<name> or --from-file=<path>. Available profiles: ${Object.keys(PROFILES).join(', ')}`,
    );
    process.exit(1);
  }
  const factory = PROFILES[profile];
  if (!factory) {
    console.error(
      `Unknown profile "${profile}". Available: ${Object.keys(PROFILES).join(', ')}`,
    );
    process.exit(1);
  }
  return { samples: factory(), label: `profile:${profile}` };
}

function migrate(db: DatabaseSync) {
  const row = db.prepare('PRAGMA user_version').get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  for (const migration of MIGRATIONS.filter((m) => m.version > current)) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function main() {
  const { samples, label } = pickSamples();
  const force = hasFlag('force');
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);

  const existing = db.prepare('SELECT COUNT(*) AS n FROM samples').get() as {
    n: number;
  };
  if (existing.n > 0 && !force) {
    console.error(
      `Refusing to overwrite ${existing.n} existing samples. Pass --force to clear and re-seed.`,
    );
    db.close();
    process.exit(1);
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM samples').run();
    const insert = db.prepare(
      'INSERT INTO samples (ts, activity, confidence, focused_app, focused_window) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of samples) {
      insert.run(s.ts, s.activity, s.confidence, s.focusedApp, s.focusedWindow);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.close();
  console.log(`Wrote ${samples.length} samples from ${label} to ${dbPath}`);
}

main();
