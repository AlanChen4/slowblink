import { samplesToSegments } from '../../../shared/overview/segmenter';
import type { Sample, Segment } from '../../../shared/types';
import { DLP_BLOCKED_ACTIVITY } from '../types';
import { classifyInBatches } from './classify';
import { createByoOpenAIProvider } from './providers/byo-openai';
import { createCloudProxyProvider } from './providers/cloud-proxy';
import { generateTaxonomy } from './taxonomy';
import type {
  Classification,
  ClassificationConfig,
  ClassificationProvider,
  PromptSegment,
  SegmentWithActivities,
  Taxonomy,
} from './types';

export type {
  Classification,
  ClassificationConfig,
  ClassificationProvider,
  Category,
  Taxonomy,
  SegmentWithActivities,
} from './types';
export { DEFAULT_CLASSIFICATION_CONFIG } from './types';

function pickProvider(
  config: ClassificationConfig,
  override?: ClassificationProvider,
): ClassificationProvider {
  if (override) return override;
  if (config.aiMode === 'cloud-ai') {
    return createCloudProxyProvider();
  }
  if (!config.apiKey) {
    throw new Error('classifySegments: BYO mode requires apiKey');
  }
  return createByoOpenAIProvider(config.apiKey);
}

function attachActivities(
  segments: Segment[],
  samples: Sample[],
): SegmentWithActivities[] {
  const out: SegmentWithActivities[] = [];
  let cursor = 0;
  for (const seg of segments) {
    if (seg.focusedApp === null) continue; // skip idle segments
    const activities = new Set<string>();
    while (cursor < samples.length && samples[cursor].ts < seg.startTs) {
      cursor++;
    }
    let scan = cursor;
    while (scan < samples.length && samples[scan].ts < seg.endTs) {
      const s = samples[scan];
      if (s.activity && s.activity !== DLP_BLOCKED_ACTIVITY) {
        activities.add(s.activity);
      }
      scan++;
    }
    out.push({ ...seg, activities: [...activities] });
  }
  return out;
}

export interface ClassifySegmentsOptions {
  samples: Sample[];
  existingTaxonomy: Taxonomy | null;
  config: ClassificationConfig;
  provider?: ClassificationProvider; // test injection
  // When true, skip Pass 1 (taxonomy generation) entirely. existingTaxonomy is
  // used verbatim by Pass 2. Used by the eval test to isolate Pass 2 accuracy
  // against a fixed seed taxonomy.
  skipTaxonomyPass?: boolean;
}

export interface ClassifySegmentsResult {
  taxonomy: Taxonomy;
  classifications: Classification[];
  enrichedSegments: SegmentWithActivities[];
}

export async function classifySegments(
  opts: ClassifySegmentsOptions,
): Promise<ClassifySegmentsResult> {
  const provider = pickProvider(opts.config, opts.provider);
  const segments = samplesToSegments(opts.samples);
  const enriched = attachActivities(segments, opts.samples);

  const promptSegments: PromptSegment[] = enriched.map((s) => ({
    app: s.focusedApp,
    window: s.focusedWindow,
    durationMs: s.durationMs,
    activities: s.activities,
  }));

  const taxonomy = opts.skipTaxonomyPass
    ? (opts.existingTaxonomy ?? { categories: [] })
    : await generateTaxonomy({
        provider,
        existingTaxonomy: opts.existingTaxonomy,
        segments: promptSegments,
        model: opts.config.taxonomyModel,
        userContext: opts.config.userContext,
      });

  const classifications = await classifyInBatches({
    provider,
    taxonomy,
    segments: enriched,
    model: opts.config.classifyModel,
    batchSize: opts.config.batchSize,
    maxConcurrency: opts.config.maxConcurrency,
    userContext: opts.config.userContext,
  });

  return { taxonomy, classifications, enrichedSegments: enriched };
}
