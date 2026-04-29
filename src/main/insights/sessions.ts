import type { Category, Sample, Session } from '../../shared/types';
import { insertSession, updateSession } from '../db';
import { createEmitter } from '../emitter';

const IDLE_GAP_MS = 2 * 60 * 1000;
const SOFT_BREAK_COUNT = 3;
const CONTINUITY_THRESHOLD = 0.5;

interface OpenSession {
  dbSession: Session;
  categoryCounts: Record<string, number>;
  projectCounts: Record<string, number>;
  appCounts: Record<string, number>;
  divergentRun: number;
  lastSampleTs: number;
}

let open: OpenSession | null = null;

const sessionClosedEmitter = createEmitter<Session>();
export const onSessionClosed = sessionClosedEmitter.on;

function continuity(a: Sample, b: Sample): number {
  let score = 0;
  if (a.category === b.category) score += 0.5;
  if (a.project === b.project) score += 0.3;
  if (a.focusedApp === b.focusedApp) score += 0.2;
  return score;
}

function dominant<T extends string>(counts: Record<string, number>): T {
  let best = '' as T;
  let max = -1;
  for (const [key, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = key as T;
    }
  }
  return best;
}

function buildCategoryMix(
  counts: Record<string, number>,
): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const mix: Record<string, number> = {};
  for (const [cat, count] of Object.entries(counts)) {
    mix[cat] = Math.round((count / total) * 100);
  }
  return mix;
}

function startNewSession(sample: Sample): void {
  const categoryCounts: Record<string, number> = {};
  const projectCounts: Record<string, number> = {};
  const appCounts: Record<string, number> = {};

  categoryCounts[sample.category] = 1;
  if (sample.project) projectCounts[sample.project] = 1;
  if (sample.focusedApp) appCounts[sample.focusedApp] = 1;

  const dbSession = insertSession({
    startTs: sample.ts,
    endTs: sample.ts,
    durationMs: 0,
    primaryCategory: sample.category,
    primaryProject: sample.project,
    primaryApp: sample.focusedApp,
    sampleCount: 1,
    categoryMix: { [sample.category]: 100 },
  });

  open = {
    dbSession,
    categoryCounts,
    projectCounts,
    appCounts,
    divergentRun: 0,
    lastSampleTs: sample.ts,
  };
}

function closeCurrentSession(): Session | null {
  if (!open) return null;
  const closed = open.dbSession;
  open = null;
  sessionClosedEmitter.emit(closed);
  return closed;
}

function extendSession(o: OpenSession, sample: Sample): void {
  o.categoryCounts[sample.category] =
    (o.categoryCounts[sample.category] ?? 0) + 1;
  if (sample.project) {
    o.projectCounts[sample.project] =
      (o.projectCounts[sample.project] ?? 0) + 1;
  }
  if (sample.focusedApp) {
    o.appCounts[sample.focusedApp] = (o.appCounts[sample.focusedApp] ?? 0) + 1;
  }

  const sampleCount = o.dbSession.sampleCount + 1;
  const endTs = sample.ts;
  const durationMs = endTs - o.dbSession.startTs;

  o.dbSession = {
    ...o.dbSession,
    endTs,
    durationMs,
    sampleCount,
    primaryCategory: dominant<Category>(o.categoryCounts),
    primaryProject: dominant(o.projectCounts) || null,
    primaryApp: dominant(o.appCounts) || null,
    categoryMix: buildCategoryMix(o.categoryCounts),
  };
  o.lastSampleTs = sample.ts;

  updateSession(o.dbSession);
}

let lastSample: Sample | null = null;

export function trackSample(sample: Sample): void {
  if (!open) {
    startNewSession(sample);
    lastSample = sample;
    return;
  }

  const gap = sample.ts - open.lastSampleTs;
  if (gap > IDLE_GAP_MS) {
    closeCurrentSession();
    startNewSession(sample);
    lastSample = sample;
    return;
  }

  if (lastSample) {
    const score = continuity(lastSample, sample);
    if (score < CONTINUITY_THRESHOLD) {
      open.divergentRun++;
    } else {
      open.divergentRun = 0;
    }
  }

  if (open.divergentRun >= SOFT_BREAK_COUNT) {
    closeCurrentSession();
    startNewSession(sample);
    lastSample = sample;
    return;
  }

  extendSession(open, sample);
  lastSample = sample;
}

export function flushOpenSession(): Session | null {
  return closeCurrentSession();
}
