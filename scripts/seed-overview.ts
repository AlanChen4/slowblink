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
import { randomUUID } from 'node:crypto';
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

interface ExportedAppIcon {
  app_name: string;
  data_url: string;
  updated_at: number;
}

interface LoadedFile {
  samples: Sample[];
  appIcons: ExportedAppIcon[];
}

function loadFromFile(path: string): LoadedFile {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as
    | ExportedSample[]
    | { samples: ExportedSample[]; appIcons?: ExportedAppIcon[] };
  const sampleRows = Array.isArray(parsed) ? parsed : parsed.samples;
  const iconRows = Array.isArray(parsed) ? [] : (parsed.appIcons ?? []);
  if (!Array.isArray(sampleRows)) {
    console.error('export file has no samples array');
    process.exit(1);
  }
  const samples = sampleRows.map((row, i) => ({
    id: i + 1,
    ts: row.ts,
    activity: row.activity,
    confidence: row.confidence ?? 0,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
  }));
  return { samples, appIcons: iconRows };
}

function pickSamples(): {
  samples: Sample[];
  appIcons: ExportedAppIcon[];
  label: string;
} {
  const fromFile = getArg('from-file');
  if (fromFile) {
    const loaded = loadFromFile(fromFile);
    return { ...loaded, label: `file:${fromFile}` };
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
  return { samples: factory(), appIcons: [], label: `profile:${profile}` };
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
  const { samples, appIcons, label } = pickSamples();
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
    db.prepare('DELETE FROM app_icons').run();
    const insertSample = db.prepare(
      'INSERT INTO samples (ts, activity, confidence, focused_app, focused_window) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of samples) {
      insertSample.run(
        s.ts,
        s.activity,
        s.confidence,
        s.focusedApp,
        s.focusedWindow,
      );
    }
    const insertIcon = db.prepare(
      `INSERT OR REPLACE INTO app_icons
       (id, app_name, data_url, updated_at, sync_state)
       VALUES (?, ?, ?, ?, 'synced')`,
    );
    for (const icon of appIcons) {
      insertIcon.run(
        randomUUID(),
        icon.app_name,
        icon.data_url,
        icon.updated_at,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.close();
  console.log(
    `Wrote ${samples.length} samples + ${appIcons.length} app icons from ${label} to ${dbPath}`,
  );
}

main();
