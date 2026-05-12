import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { Sample } from '../../shared/types';
import { createEmitter } from '../emitter';
import {
  type AppIconStatements,
  bumpAppIconSyncAttempts as bumpAppIconSyncAttemptsRaw,
  getAppIcon as getAppIconRaw,
  getAppIconsForNames as getAppIconsForNamesRaw,
  getPendingAppIcons as getPendingAppIconsRaw,
  markAppIconsFailed as markAppIconsFailedRaw,
  markAppIconsSynced as markAppIconsSyncedRaw,
  type PendingAppIconRow,
  prepareAppIconStatements,
  upsertAppIcon as upsertAppIconRaw,
} from './app-icons';
import {
  type DevCaptureRow,
  type DevCapturesStatements,
  deleteCapturesByIds,
  insertCapture,
  listAllCaptureIds,
  prepareDevCapturesStatements,
  reconcileOrphans,
} from './dev-captures';
import { runMigrations } from './migrations';
import {
  getSamplesInRange,
  insertSampleRow,
  prepareSampleStatements,
  type SampleStatements,
} from './samples';
import {
  bumpBatchAttempts,
  countSamplesByState,
  getPendingSamples,
  markBatchFailed,
  markSamplesSynced,
  type PendingSampleRow,
  prepareSyncStatements,
  type SyncCounts,
  type SyncStatements,
} from './sync-state';

interface DbHandles {
  db: Database.Database;
  samples: SampleStatements;
  sync: SyncStatements;
  devCaptures: DevCapturesStatements;
  appIcons: AppIconStatements;
}

let handles: DbHandles | null = null;
let dbPath: string | null = null;
let devCapturesDir: string | null = null;

const sampleInsertEmitter = createEmitter<Sample>();
export const onSampleInserted = sampleInsertEmitter.on;

const appIconUpsertEmitter = createEmitter<string>();
export const onAppIconUpserted = appIconUpsertEmitter.on;

export function initDb() {
  dbPath = join(app.getPath('userData'), 'slowblink.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  const devCaptures = prepareDevCapturesStatements(db);
  handles = {
    db,
    samples: prepareSampleStatements(db),
    sync: prepareSyncStatements(db),
    devCaptures,
    appIcons: prepareAppIconStatements(db),
  };
  devCapturesDir = join(app.getPath('userData'), 'dev-captures');
  if (!app.isPackaged) {
    mkdirSync(devCapturesDir, { recursive: true });
    sweepDevCaptureOrphans(devCaptures, devCapturesDir);
  }
}

export function getDevCapturesDir(): string {
  if (!devCapturesDir) {
    throw new Error('database not initialized; call initDb() first');
  }
  return devCapturesDir;
}

export function getLocalStorageSize(): number {
  if (!dbPath) return 0;
  const paths = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  let total = 0;
  for (const p of paths) {
    try {
      total += statSync(p).size;
    } catch {
      // sidecar may not exist yet; ignore
    }
  }
  return total;
}

function requireHandles(): DbHandles {
  if (!handles)
    throw new Error('database not initialized; call initDb() first');
  return handles;
}

export function insertSample(s: Omit<Sample, 'id'>): Sample {
  const sample = insertSampleRow(requireHandles().samples, s);
  sampleInsertEmitter.emit(sample);
  return sample;
}

export function getSamples(rangeStart: number, rangeEnd: number): Sample[] {
  return getSamplesInRange(requireHandles().samples, rangeStart, rangeEnd);
}

export function deleteAll() {
  const h = requireHandles();
  h.samples.deleteAll.run();
  h.appIcons.deleteAll.run();
}

export function getPendingForSync(
  now: number,
  limit: number,
): PendingSampleRow[] {
  return getPendingSamples(requireHandles().sync, now, limit);
}

export function markSynced(
  ids: number[],
  serverIds: Record<number, string | null>,
  syncTs: number,
) {
  const h = requireHandles();
  markSamplesSynced(h.db, h.sync, ids, serverIds, syncTs);
}

export function bumpSyncAttempts(
  ids: number[],
  nextAttemptTs: number,
  error: string,
) {
  bumpBatchAttempts(requireHandles().sync, ids, nextAttemptTs, error);
}

export function markFailed(ids: number[], error: string) {
  markBatchFailed(requireHandles().sync, ids, error);
}

export function getSyncCounts(): SyncCounts {
  return countSamplesByState(requireHandles().sync);
}

export function retryFailedSamples() {
  requireHandles().sync.resetFailedToPending.run();
}

export function insertDevCapture(row: DevCaptureRow): void {
  insertCapture(requireHandles().devCaptures, row);
}

export function upsertAppIcon(
  appName: string,
  dataUrl: string,
  now: number,
): void {
  upsertAppIconRaw(requireHandles().appIcons, appName, dataUrl, now);
  appIconUpsertEmitter.emit(appName);
}

export function getAppIcon(appName: string) {
  return getAppIconRaw(requireHandles().appIcons, appName);
}

export function getAppIconsForNames(names: string[]) {
  return getAppIconsForNamesRaw(requireHandles().appIcons, names);
}

export function getPendingAppIcons(
  now: number,
  limit: number,
): PendingAppIconRow[] {
  return getPendingAppIconsRaw(requireHandles().appIcons, now, limit);
}

export function markAppIconsSynced(
  rows: { appName: string; updatedAt: number }[],
  syncTs: number,
): void {
  const h = requireHandles();
  markAppIconsSyncedRaw(h.db, h.appIcons, rows, syncTs);
}

export function bumpAppIconSyncAttempts(
  names: string[],
  nextAttemptTs: number,
  error: string,
): void {
  bumpAppIconSyncAttemptsRaw(
    requireHandles().appIcons,
    names,
    nextAttemptTs,
    error,
  );
}

export function markAppIconsFailed(names: string[], error: string): void {
  markAppIconsFailedRaw(requireHandles().appIcons, names, error);
}

function sweepDevCaptureOrphans(
  stmts: DevCapturesStatements,
  dir: string,
): void {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }
  const fileIds: string[] = [];
  for (const f of files) {
    if (f.endsWith('.jpg')) fileIds.push(f.slice(0, -4));
  }
  const rowIds = listAllCaptureIds(stmts);
  const { filesToUnlink, rowsToDelete } = reconcileOrphans(fileIds, rowIds);
  for (const id of filesToUnlink) {
    try {
      unlinkSync(join(dir, `${id}.jpg`));
    } catch {
      // best-effort
    }
  }
  if (rowsToDelete.length > 0) deleteCapturesByIds(stmts, rowsToDelete);
}

export type { AppIconRow, PendingAppIconRow } from './app-icons';
export type { DevCaptureRow } from './dev-captures';
export type { PendingSampleRow, SyncCounts } from './sync-state';
