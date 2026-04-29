import type { OverviewDebug, OverviewScope } from '../../shared/types';
import { aggregate } from './aggregator';
import {
  buildLocalPipeline,
  deriveRange,
  fetchSupabaseSamples,
  getOverview,
} from './index';
import { samplesToSegments } from './segmenter';

export async function getOverviewDebug(
  rangeStart: number,
  rangeEnd: number,
  scope: OverviewScope,
): Promise<OverviewDebug> {
  if (scope === 'this-device') {
    const pipe = buildLocalPipeline(rangeStart, rangeEnd);
    return {
      range: { ...pipe.range, scope },
      samples: pipe.samples,
      segments: pipe.segments,
      aggregate: pipe.aggregate,
    };
  }
  const samples = await fetchSupabaseSamples(rangeStart, rangeEnd);
  const segments = samplesToSegments(samples);
  const agg = aggregate(segments);
  const range = deriveRange(rangeStart, rangeEnd);
  return {
    range: { ...range, scope },
    samples,
    segments,
    aggregate: agg,
  };
}

export function refreshOverviewDebug(
  rangeStart: number,
  rangeEnd: number,
  scope: OverviewScope,
): Promise<OverviewDebug> {
  // No cache to invalidate anymore; refresh just re-runs the same path.
  return getOverviewDebug(rangeStart, rangeEnd, scope);
}

// Re-export for compatibility with any callers expecting a typed Overview.
export { getOverview };
