import type {
  Overview,
  OverviewAggregate,
  OverviewScope,
  Sample,
  Segment,
} from '../../shared/types';
import { getSupabase } from '../auth/client';
import { getCurrentSession } from '../auth/session';
import { getSamples as getSamplesFromDb } from '../db';
import { aggregate } from './aggregator';
import { samplesToSegments } from './segmenter';

const SUPABASE_PAGE_SIZE = 1000;

export interface OverviewRange {
  startTs: number;
  endTs: number;
  rangeKey: string;
  timezone: string;
}

function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function formatDayKey(ts: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ts);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `day:${year}-${month}-${day}`;
}

export function deriveRange(
  rangeStart: number,
  rangeEnd: number,
): OverviewRange {
  const timezone = getTimezone();
  return {
    startTs: rangeStart,
    endTs: rangeEnd,
    rangeKey: formatDayKey(rangeStart, timezone),
    timezone,
  };
}

export interface LocalPipeline {
  samples: Sample[];
  segments: Segment[];
  aggregate: OverviewAggregate;
  range: OverviewRange;
}

export function buildLocalPipeline(
  rangeStart: number,
  rangeEnd: number,
): LocalPipeline {
  const samples = getSamplesFromDb(rangeStart, rangeEnd);
  return runPipeline(samples, rangeStart, rangeEnd);
}

function runPipeline(
  samples: Sample[],
  rangeStart: number,
  rangeEnd: number,
): LocalPipeline {
  const segments = samplesToSegments(samples);
  const agg = aggregate(segments);
  const range = deriveRange(rangeStart, rangeEnd);
  return { samples, segments, aggregate: agg, range };
}

interface SupabaseSampleRow {
  id: number;
  ts: string;
  activity: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
}

function rowToSample(row: SupabaseSampleRow): Sample {
  return {
    id: row.id,
    ts: new Date(row.ts).getTime(),
    activity: row.activity,
    confidence: row.confidence ?? 0,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
  };
}

export async function fetchSupabaseSamples(
  rangeStart: number,
  rangeEnd: number,
): Promise<Sample[]> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud sync is not configured');
  }
  if (!getCurrentSession()) throw new Error('Not signed in');

  const startIso = new Date(rangeStart).toISOString();
  const endIso = new Date(rangeEnd).toISOString();
  const samples: Sample[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from('samples')
      .select('id, ts, activity, confidence, focused_app, focused_window')
      .gte('ts', startIso)
      .lt('ts', endIso)
      .order('ts', { ascending: true })
      .range(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as SupabaseSampleRow[];
    for (const r of rows) samples.push(rowToSample(r));
    if (rows.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }
  return samples;
}

async function getOverviewThisDevice(
  rangeStart: number,
  rangeEnd: number,
): Promise<Overview> {
  const pipe = buildLocalPipeline(rangeStart, rangeEnd);
  return {
    scope: 'this-device',
    rangeStart,
    rangeEnd,
    segments: pipe.segments,
    aggregate: pipe.aggregate,
  };
}

async function getOverviewAllDevices(
  rangeStart: number,
  rangeEnd: number,
): Promise<Overview> {
  const samples = await fetchSupabaseSamples(rangeStart, rangeEnd);
  const pipe = runPipeline(samples, rangeStart, rangeEnd);
  return {
    scope: 'all-devices',
    rangeStart,
    rangeEnd,
    segments: pipe.segments,
    aggregate: pipe.aggregate,
  };
}

export async function getOverview(
  rangeStart: number,
  rangeEnd: number,
  scope: OverviewScope,
): Promise<Overview> {
  if (scope === 'all-devices') {
    return getOverviewAllDevices(rangeStart, rangeEnd);
  }
  return getOverviewThisDevice(rangeStart, rangeEnd);
}
