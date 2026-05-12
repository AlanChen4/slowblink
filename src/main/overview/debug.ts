import { aggregate } from '../../shared/overview/aggregator';
import { samplesToSegments } from '../../shared/overview/segmenter';
import type {
  OverviewAggregate,
  OverviewScope,
  Sample,
  Segment,
} from '../../shared/types';
import { buildLocalPipeline, deriveRange, fetchSupabaseSamples } from './index';

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
