import { net } from 'electron';
import type {
  Sample,
  Settings,
  SyncRuntimeState,
  SyncStatus,
} from '../../shared/types';
import { getCurrentSession, onSessionChange } from '../auth/session';
import {
  bumpSyncAttempts,
  getPendingForSync,
  getSyncCounts,
  markFailed,
  markSynced,
  onSampleInserted,
  retryFailedSamples,
} from '../db';
import { createEmitter } from '../emitter';
import { getSettings, onSettingsChange } from '../settings';
import {
  AuthRequiredError,
  PermanentIngestError,
  postIngestBatch,
  TransientIngestError,
} from './ingest-client';

const FLUSH_INTERVAL_MS = 60_000;
const IDLE_FLUSH_MS = 5_000;
const BATCH_ROW_THRESHOLD = 50;
const MAX_BATCH_SIZE = 200;
const MAX_ATTEMPTS = 8;
const BACKOFF_LADDER_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  60 * 60_000,
];

const statusEmitter = createEmitter<SyncStatus>();
export const onSyncStatusChange = statusEmitter.on;

let periodicTimer: NodeJS.Timeout | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let pendingSinceInsert = 0;
let flushInFlight = false;
let lastFlushTs: number | null = null;
let lastError: string | null = null;
let runtimeState: SyncRuntimeState = 'disabled';

function enabled(settings: Settings): boolean {
  if (settings.storageMode !== 'cloud-sync') return false;
  const session = getCurrentSession();
  return !!session;
}

export function getSyncStatus(): SyncStatus {
  const counts = safeCounts();
  const settings = getSettings();
  const isEnabled = enabled(settings);
  const state: SyncRuntimeState = isEnabled ? runtimeState : 'disabled';
  return {
    enabled: isEnabled,
    state,
    lastFlushTs,
    pending: counts.pending,
    synced: counts.synced,
    failed: counts.failed,
    lastError,
  };
}

function safeCounts() {
  try {
    return getSyncCounts();
  } catch {
    return { pending: 0, synced: 0, failed: 0 };
  }
}

let lastEmitted: SyncStatus | null = null;

function statusEqual(a: SyncStatus, b: SyncStatus): boolean {
  return (
    a.enabled === b.enabled &&
    a.state === b.state &&
    a.lastFlushTs === b.lastFlushTs &&
    a.pending === b.pending &&
    a.synced === b.synced &&
    a.failed === b.failed &&
    a.lastError === b.lastError
  );
}

function emit() {
  const next = getSyncStatus();
  if (lastEmitted && statusEqual(lastEmitted, next)) return;
  lastEmitted = next;
  statusEmitter.emit(next);
}

function setRuntimeState(next: SyncRuntimeState, err: string | null = null) {
  if (runtimeState === next && lastError === err) return;
  runtimeState = next;
  lastError = err;
  emit();
}

function schedulePeriodic() {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void flush('periodic');
  }, FLUSH_INTERVAL_MS);
}

function clearPeriodic() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

function bumpIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void flush('idle');
  }, IDLE_FLUSH_MS);
}

function clearIdle() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function backoffFor(attempts: number): number {
  const idx = Math.min(attempts, BACKOFF_LADDER_MS.length - 1);
  return BACKOFF_LADDER_MS[idx];
}

async function flush(reason: 'periodic' | 'idle' | 'size' | 'manual') {
  if (flushInFlight) return;
  const settings = getSettings();
  if (!enabled(settings)) {
    setRuntimeState('disabled');
    return;
  }
  if (!net.isOnline()) {
    setRuntimeState('offline');
    return;
  }

  flushInFlight = true;
  const batch = getPendingForSync(Date.now(), MAX_BATCH_SIZE);
  try {
    if (batch.length === 0) {
      pendingSinceInsert = 0;
      setRuntimeState('idle');
      return;
    }
    setRuntimeState('syncing');
    console.log(`[sync] flushing ${batch.length} rows (reason=${reason})`);
    const result = await postIngestBatch(batch);
    const syncedIds = batch
      .map((r) => r.id)
      .filter((id) => !result.rejectedIds.includes(id));
    markSynced(syncedIds, result.serverIds, Date.now());
    if (result.rejectedIds.length > 0) {
      const msg = `Rejected ${result.rejectedIds.length} row(s): ${Object.values(result.rejectedReasons)[0] ?? 'unknown'}`;
      markFailed(result.rejectedIds, msg);
    }
    lastFlushTs = Date.now();
    pendingSinceInsert = 0;
    setRuntimeState('idle');
  } catch (err) {
    handleFlushError(err, batch);
  } finally {
    flushInFlight = false;
  }
}

function applyBackoff(
  batch: ReturnType<typeof getPendingForSync>,
  msg: string,
) {
  const now = Date.now();
  for (const row of batch) {
    const attempts = row.sync_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      markFailed([row.id], msg);
    } else {
      bumpSyncAttempts([row.id], now + backoffFor(attempts), msg);
    }
  }
}

function handleFlushError(
  err: unknown,
  batch: ReturnType<typeof getPendingForSync>,
) {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof AuthRequiredError) {
    setRuntimeState('error', 'Authentication required — sign in again');
    return;
  }
  if (err instanceof PermanentIngestError) {
    const ids = batch.map((r) => r.id);
    if (ids.length) markFailed(ids, msg);
    setRuntimeState('error', msg);
    return;
  }
  if (err instanceof TransientIngestError || !net.isOnline()) {
    applyBackoff(batch, msg);
    setRuntimeState(net.isOnline() ? 'error' : 'offline', msg);
    return;
  }
  setRuntimeState('error', msg);
}

function onSampleInsertedHandler(_: Sample) {
  const settings = getSettings();
  if (!enabled(settings)) return;
  pendingSinceInsert += 1;
  if (pendingSinceInsert >= BATCH_ROW_THRESHOLD) {
    pendingSinceInsert = 0;
    clearIdle();
    void flush('size');
  } else {
    bumpIdleTimer();
  }
}

let syncInitialized = false;

export function initSync() {
  if (syncInitialized) return;
  syncInitialized = true;
  onSampleInserted(onSampleInsertedHandler);
  onSettingsChange(refresh);
  onSessionChange(refresh);
  refresh();
}

function refresh() {
  const settings = getSettings();
  if (enabled(settings)) {
    schedulePeriodic();
    setRuntimeState('idle');
    void flush('periodic');
  } else {
    clearPeriodic();
    clearIdle();
    setRuntimeState('disabled');
  }
}

export async function flushNow() {
  await flush('manual');
}

export function retryFailed() {
  retryFailedSamples();
  emit();
  void flush('manual');
}
