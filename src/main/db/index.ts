import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { Sample } from '../../shared/types';
import { createEmitter } from '../emitter';
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
}

let handles: DbHandles | null = null;

const sampleInsertEmitter = createEmitter<Sample>();
export const onSampleInserted = sampleInsertEmitter.on;

export function initDb() {
  const path = join(app.getPath('userData'), 'slowblink.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  handles = {
    db,
    samples: prepareSampleStatements(db),
    sync: prepareSyncStatements(db),
  };
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
  requireHandles().samples.deleteAll.run();
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

export type { PendingSampleRow, SyncCounts } from './sync-state';
