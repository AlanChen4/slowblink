import type { EffectCallback } from 'react';
import { useEffect } from 'react';
import type {
  OverviewAggregate,
  OverviewScope,
  Sample,
  Segment,
} from '@shared/types';

export type { OverviewAggregate, OverviewScope, Sample, Segment };

export type Outcome = 'success' | 'dlp_blocked' | 'error';
export type FilterValue = 'all' | Outcome;

export interface CaptureListRow {
  id: string;
  sample_id: number | null;
  captured_at: number;
  request_started_at: number | null;
  response_received_at: number | null;
  provider: string;
  model: string | null;
  outcome: Outcome;
  error_message: string | null;
  focused_app: string | null;
  focused_window: string | null;
  image_size_bytes: number | null;
}

export interface CaptureDetail extends CaptureListRow {
  request: unknown;
  response: unknown;
  parsed_result: unknown;
}

export interface OverviewDebug {
  range: {
    startTs: number;
    endTs: number;
    rangeKey: string;
    scope: OverviewScope;
    timezone: string;
  };
  samples: Sample[];
  segments: Segment[];
  aggregate: OverviewAggregate;
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  message: string;
}

export interface CaptureStatus {
  running: boolean;
  lastError: string | null;
  autoPaused: string | null;
  hasPermission: boolean;
  hasAccessibility: boolean;
  hasApiKey: boolean;
}

export const PAGE_SIZE = 50;
export const POLL_INTERVAL_MS = 3000;
export const CAPTURE_TIMEOUT_MS = 30_000;
export const CONTROL_ORIGIN = 'http://127.0.0.1:5175';

export const EMPTY_VALUE = '—';

export const OUTCOME_THEME: Record<Outcome, { fg: string; bg: string }> = {
  success: { fg: 'var(--accent-success-fg)', bg: 'var(--accent-success-bg)' },
  dlp_blocked: { fg: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
  error: { fg: 'var(--accent-error-fg)', bg: 'var(--accent-error-bg)' },
};

export function useMountEffect(effect: EffectCallback): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(effect, []);
}

interface PollHandlers<T> {
  onValue: (v: T) => void;
  onError: (msg: string) => void;
}

export function startPolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number | null,
  handlers: PollHandlers<T>,
): () => void {
  let cancelled = false;
  function tick() {
    fetcher().then(
      (v) => {
        if (!cancelled) handlers.onValue(v);
      },
      (err: unknown) => {
        if (cancelled) return;
        handlers.onError(err instanceof Error ? err.message : String(err));
      },
    );
  }
  tick();
  const id = intervalMs ? setInterval(tick, intervalMs) : null;
  return () => {
    cancelled = true;
    if (id !== null) clearInterval(id);
  };
}

export async function fetchCaptures(
  outcome: FilterValue,
  before: number | null,
): Promise<CaptureListRow[]> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (outcome !== 'all') params.set('outcome', outcome);
  if (before !== null) params.set('before', String(before));
  const res = await fetch(`/api/captures?${params.toString()}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const json = (await res.json()) as { captures: CaptureListRow[] };
  return json.captures;
}

export async function fetchCapture(id: string): Promise<CaptureDetail> {
  const res = await fetch(`/api/captures/${id}`);
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  const json = (await res.json()) as { capture: CaptureDetail };
  return json.capture;
}

export async function clearAll(): Promise<{ rows: number; files: number }> {
  const res = await fetch('/api/clear', { method: 'POST' });
  if (!res.ok) throw new Error(`clear failed: ${res.status}`);
  return (await res.json()) as { rows: number; files: number };
}

async function controlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${CONTROL_ORIGIN}${path}`, init);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `request failed: ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Electron app not running.');
    }
    throw err;
  }
}

export async function triggerCapture(): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CAPTURE_TIMEOUT_MS);
  try {
    await controlFetch<{ ok: true }>('/capture', {
      method: 'POST',
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function fetchStatus(): Promise<CaptureStatus> {
  return controlFetch<CaptureStatus>('/status');
}

export function fetchLogs(): Promise<{ entries: LogEntry[] }> {
  return controlFetch<{ entries: LogEntry[] }>('/logs');
}

export function fetchOverviewDebug(
  start: number,
  end: number,
  scope: OverviewScope,
): Promise<OverviewDebug> {
  const params = new URLSearchParams({
    start: String(start),
    end: String(end),
    scope,
  });
  return controlFetch<OverviewDebug>(`/overview-debug?${params.toString()}`);
}

export interface FixtureSampleRow {
  ts: number;
  activity: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
}

export interface FixtureListEntry {
  name: string;
  samples: number;
  sizeBytes: number;
  mtime: number;
}

export async function fetchFixtures(): Promise<FixtureListEntry[]> {
  const res = await fetch('/api/fixtures');
  if (!res.ok) throw new Error(`list fixtures failed: ${res.status}`);
  const json = (await res.json()) as { fixtures: FixtureListEntry[] };
  return json.fixtures;
}

export async function fetchFixture(name: string): Promise<FixtureSampleRow[]> {
  const res = await fetch(`/api/fixtures/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`read fixture failed: ${res.status}`);
  const json = (await res.json()) as { samples: FixtureSampleRow[] };
  return json.samples;
}

export async function saveFixture(
  name: string,
  samples: Sample[],
): Promise<{ name: string }> {
  const body = JSON.stringify({
    name,
    samples: samples.map(sampleToFixtureRow),
  });
  const res = await fetch('/api/fixtures', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(errBody?.error ?? `save fixture failed: ${res.status}`);
  }
  return (await res.json()) as { name: string };
}

function sampleToFixtureRow(sample: Sample): FixtureSampleRow {
  return {
    ts: sample.ts,
    activity: sample.activity,
    confidence: sample.confidence,
    focused_app: sample.focusedApp,
    focused_window: sample.focusedWindow,
  };
}

export function fixtureRowsToSamples(rows: FixtureSampleRow[]): Sample[] {
  return rows.map((row, i) => ({
    id: i + 1,
    ts: row.ts,
    activity: row.activity,
    confidence: row.confidence ?? 0,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
  }));
}

export function dayStartWithOffset(offset: number, now = new Date()): number {
  const d = new Date(now);
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (min > 0 || parts.length === 0) parts.push(`${min}m`);
  return parts.join(' ');
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function formatLatency(
  start: number | null,
  end: number | null,
): string {
  if (start === null || end === null) return EMPTY_VALUE;
  return `${end - start} ms`;
}
