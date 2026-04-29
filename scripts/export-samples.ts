/**
 * Dev CLI: export the local Electron DB's samples to a JSON file so they can
 * be reloaded after a schema reset via `pnpm overview:seed --from-file=...`.
 *
 * Usage:
 *   pnpm overview:export-samples --name=<nickname>           write fixtures/samples-<nickname>.json
 *   pnpm overview:export-samples --name=<nickname> --force   overwrite an existing file
 *   pnpm overview:export-samples --out=<path>                write to a custom path
 *
 * The nickname becomes part of the filename so multiple snapshots can coexist
 * in fixtures/ (e.g. an "investigation-2026-04-23" baseline + a later one).
 *
 * Safe to run while slowblink is open — opens the DB read-only.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from './db-path';

interface SampleRow {
  ts: number;
  activity: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function resolveOutPath(): string {
  const explicitOut = getArg('out');
  if (explicitOut) return resolve(explicitOut);
  const name = getArg('name');
  if (!name) {
    console.error(
      'Missing --name=<nickname> (or --out=<path>). Example:\n' +
        '  pnpm overview:export-samples --name=investigation-2026-04-23',
    );
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    console.error(
      `Invalid --name=${JSON.stringify(name)}: use letters, digits, dots, dashes, or underscores.`,
    );
    process.exit(1);
  }
  return resolve(`fixtures/samples-${name}.json`);
}

function main() {
  const dbPath = resolveDbPath();
  const out = resolveOutPath();
  const force = hasFlag('force');
  if (existsSync(out) && !force) {
    console.error(`Refusing to overwrite ${out}. Pass --force to replace it.`);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  // Use ascending id order so re-seeding produces the same row layout.
  const rows = db
    .prepare(
      'SELECT ts, activity, confidence, focused_app, focused_window FROM samples ORDER BY id ASC',
    )
    .all() as unknown as SampleRow[];
  db.close();

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows, null, 2));

  const first = rows[0]?.ts;
  const last = rows[rows.length - 1]?.ts;
  console.log(`Exported ${rows.length} samples to ${out}`);
  if (first && last) {
    console.log(
      `  range: ${new Date(first).toISOString()} → ${new Date(last).toISOString()}`,
    );
  }
}

main();
