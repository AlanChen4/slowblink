import { describe, expect, test } from 'vitest';
import { classifyInBatches } from './classify';
import type {
  ClassificationProvider,
  ClassifyBatchRequest,
  ClassifiedSegment,
  ProposedTaxonomyAdditions,
  SegmentWithActivities,
  Taxonomy,
  TaxonomyRequest,
} from './types';

const TAXONOMY: Taxonomy = {
  categories: [
    { name: 'Work', subcategories: ['Coding', 'Reviewing PR'] },
    { name: 'Communication', subcategories: ['Slack', 'Email'] },
  ],
};

function makeSegments(count: number): SegmentWithActivities[] {
  return Array.from({ length: count }, (_, i) => ({
    startTs: i * 1000,
    endTs: (i + 1) * 1000,
    durationMs: 1000,
    focusedApp: i % 2 === 0 ? 'Cursor' : 'Slack',
    focusedWindow: `window-${i}`,
    activities: [`activity-${i}`],
  }));
}

function fakeProvider(
  classify: (
    req: ClassifyBatchRequest,
  ) => Promise<ClassifiedSegment[] | { blocked: true; reason: string }>,
): ClassificationProvider {
  return {
    generateTaxonomy(
      _req: TaxonomyRequest,
    ): Promise<ProposedTaxonomyAdditions> {
      return Promise.resolve({ newCategories: [], newSubcategories: [] });
    },
    classifyBatch: classify,
  };
}

describe('classifyInBatches', () => {
  test('empty segments → empty result', async () => {
    const provider = fakeProvider(async () => []);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: [],
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toEqual([]);
  });

  test('empty taxonomy → every segment is Other', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('should not be called');
    });
    const segs = makeSegments(3);
    const result = await classifyInBatches({
      provider,
      taxonomy: { categories: [] },
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toHaveLength(3);
    for (const c of result) {
      expect(c.category).toBeNull();
      expect(c.subcategory).toBeNull();
      expect(c.confidence).toBe(0);
    }
  });

  test('25 segments + batchSize 10 → 3 batches called', async () => {
    const calls: number[] = [];
    const provider = fakeProvider(async (req) => {
      calls.push(req.segments.length);
      return req.segments.map(() => ({
        category: 'Work',
        subcategory: 'Coding',
        confidence: 0.8,
      }));
    });
    const segs = makeSegments(25);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toHaveLength(25);
    expect(calls.toSorted((a, b) => a - b)).toEqual([5, 10, 10]);
    for (const c of result) {
      expect(c.category).toBe('Work');
      expect(c.subcategory).toBe('Coding');
    }
  });

  test('maxConcurrency caps in-flight requests', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const provider = fakeProvider(async (req) => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      // Yield to let other workers race the counter; the cap should still hold.
      await new Promise<void>((r) => setTimeout(r, 5));
      inFlight--;
      return req.segments.map(() => ({
        category: 'Work',
        subcategory: 'Coding',
        confidence: 0.5,
      }));
    });
    const segs = makeSegments(40); // → 4 batches at batchSize 10
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 2,
    });
    expect(result).toHaveLength(40);
    expect(peakInFlight).toBeLessThanOrEqual(2);
    // Sanity: we did actually achieve some parallelism — at least 2 batches
    // ran concurrently at some point.
    expect(peakInFlight).toBeGreaterThanOrEqual(2);
  });

  test('batch length mismatch → falls back to per-segment retries', async () => {
    let callCount = 0;
    const provider = fakeProvider(async (req) => {
      callCount++;
      // First call returns the wrong count; per-segment retries succeed.
      if (req.segments.length === 3) return [];
      return req.segments.map(() => ({
        category: 'Communication',
        subcategory: 'Slack',
        confidence: 0.7,
      }));
    });
    const segs = makeSegments(3);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toHaveLength(3);
    // 1 (bad batch) + 3 (per-segment retries) = 4 calls.
    expect(callCount).toBe(4);
    for (const c of result) {
      expect(c.category).toBe('Communication');
      expect(c.subcategory).toBe('Slack');
    }
  });

  test('invalid (category, subcategory) pair becomes Other', async () => {
    const provider = fakeProvider(async (req) =>
      req.segments.map(() => ({
        category: 'NotInTaxonomy',
        subcategory: 'Whatever',
        confidence: 0.9,
      })),
    );
    const segs = makeSegments(2);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(c.category).toBeNull();
      expect(c.subcategory).toBeNull();
    }
  });

  test('case mismatch maps back to canonical taxonomy casing', async () => {
    const provider = fakeProvider(async (req) =>
      req.segments.map(() => ({
        category: 'work',
        subcategory: 'coding',
        confidence: 0.95,
      })),
    );
    const segs = makeSegments(1);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result[0].category).toBe('Work');
    expect(result[0].subcategory).toBe('Coding');
  });

  test('DLP block on a batch → all segments in that batch are Other', async () => {
    const provider = fakeProvider(async () => ({
      blocked: true,
      reason: 'dlp',
    }));
    const segs = makeSegments(4);
    const result = await classifyInBatches({
      provider,
      taxonomy: TAXONOMY,
      segments: segs,
      model: 'm',
      batchSize: 10,
      maxConcurrency: 5,
    });
    expect(result).toHaveLength(4);
    for (const c of result) {
      expect(c.category).toBeNull();
      expect(c.subcategory).toBeNull();
    }
  });
});
