/**
 * Dev CLI: delete the local Electron app's SQLite DB (and its WAL/SHM
 * sidecars) so the next slowblink start creates a fresh DB with the latest
 * schema. Invoked as part of `pnpm db:reset` alongside `supabase db reset`.
 *
 * Quit slowblink before running.
 */
import { rmSync } from 'node:fs';
import { resolveDbPath } from './db-path';

function main() {
  const dbPath = resolveDbPath();
  const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  let removed = 0;
  for (const target of targets) {
    try {
      rmSync(target);
      console.log(`Deleted ${target}`);
      removed += 1;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }
  if (removed === 0) {
    console.log(`No local SQLite DB at ${dbPath} (already clean).`);
  }
}

main();
