import { segmentHash } from './hash';
import type {
  Classification,
  ClassificationProvider,
  ClassifiedSegment,
  PromptSegment,
  SegmentWithActivities,
  Taxonomy,
} from './types';

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function findTaxonomyMatch(
  taxonomy: Taxonomy,
  category: string,
  subcategory: string,
): { category: string; subcategory: string } | null {
  const cat = taxonomy.categories.find(
    (c) => lower(c.name) === lower(category),
  );
  if (!cat) return null;
  const sub = cat.subcategories.find((s) => lower(s) === lower(subcategory));
  if (!sub) return null;
  return { category: cat.name, subcategory: sub };
}

function normalizeClassified(
  taxonomy: Taxonomy,
  raw: ClassifiedSegment,
): ClassifiedSegment {
  if (raw.category === null || raw.subcategory === null) {
    return { category: null, subcategory: null, confidence: 0 };
  }
  const match = findTaxonomyMatch(taxonomy, raw.category, raw.subcategory);
  if (!match) {
    return { category: null, subcategory: null, confidence: 0 };
  }
  const confidence =
    typeof raw.confidence === 'number' &&
    raw.confidence >= 0 &&
    raw.confidence <= 1
      ? raw.confidence
      : 0;
  return {
    category: match.category,
    subcategory: match.subcategory,
    confidence,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
    }
  }

  const concurrency = Math.max(1, Math.min(limit, items.length));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

interface ClassifyBatchesOptions {
  provider: ClassificationProvider;
  taxonomy: Taxonomy;
  segments: SegmentWithActivities[];
  model: string;
  batchSize: number;
  maxConcurrency: number;
  userContext?: string;
}

function toPromptSegment(seg: SegmentWithActivities): PromptSegment {
  return {
    app: seg.focusedApp,
    window: seg.focusedWindow,
    durationMs: seg.durationMs,
    activities: seg.activities,
  };
}

function otherClassification(seg: SegmentWithActivities): Classification {
  return {
    segmentHash: segmentHash(seg, seg.activities),
    category: null,
    subcategory: null,
    confidence: 0,
  };
}

async function classifyOneBatch(
  provider: ClassificationProvider,
  taxonomy: Taxonomy,
  model: string,
  batch: SegmentWithActivities[],
  userContext: string | undefined,
): Promise<Classification[]> {
  const promptSegments = batch.map(toPromptSegment);
  try {
    const raw = await provider.classifyBatch({
      taxonomy,
      segments: promptSegments,
      model,
      userContext,
    });
    if ('blocked' in raw) {
      return batch.map(otherClassification);
    }
    if (raw.length !== batch.length) {
      // Length mismatch → fall back to per-segment retries.
      throw new Error(
        `classify batch length mismatch: expected ${batch.length}, got ${raw.length}`,
      );
    }
    return batch.map((seg, i) => ({
      segmentHash: segmentHash(seg, seg.activities),
      ...normalizeClassified(taxonomy, raw[i]),
    }));
  } catch {
    // Batch-level failure (parse error, mismatch). Retry each segment alone;
    // anything that still fails becomes Other.
    return classifyEachAlone(provider, taxonomy, model, batch, userContext);
  }
}

async function classifyEachAlone(
  provider: ClassificationProvider,
  taxonomy: Taxonomy,
  model: string,
  segs: SegmentWithActivities[],
  userContext: string | undefined,
): Promise<Classification[]> {
  const out: Classification[] = [];
  for (const seg of segs) {
    try {
      const raw = await provider.classifyBatch({
        taxonomy,
        segments: [toPromptSegment(seg)],
        model,
        userContext,
      });
      if ('blocked' in raw || raw.length !== 1) {
        out.push(otherClassification(seg));
        continue;
      }
      out.push({
        segmentHash: segmentHash(seg, seg.activities),
        ...normalizeClassified(taxonomy, raw[0]),
      });
    } catch {
      out.push(otherClassification(seg));
    }
  }
  return out;
}

export async function classifyInBatches(
  opts: ClassifyBatchesOptions,
): Promise<Classification[]> {
  if (opts.segments.length === 0) return [];
  if (opts.taxonomy.categories.length === 0) {
    return opts.segments.map(otherClassification);
  }
  const batches = chunk(opts.segments, opts.batchSize);
  const batchResults = await runWithConcurrency(
    batches,
    opts.maxConcurrency,
    (batch) =>
      classifyOneBatch(
        opts.provider,
        opts.taxonomy,
        opts.model,
        batch,
        opts.userContext,
      ),
  );
  return batchResults.flat();
}
