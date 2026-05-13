import { describe, expect, test, vi } from 'vitest';
import type { Sample } from '../../../shared/types';
import { DLP_BLOCKED_ACTIVITY } from '../types';
import { classifySegments } from './index';
import type {
  ClassificationProvider,
  ClassifyBatchRequest,
  ClassifiedSegment,
  ProposedTaxonomyAdditions,
  TaxonomyRequest,
} from './types';

const TAXONOMY = {
  categories: [{ name: 'Work', subcategories: ['Coding'] }],
};

interface FakeProviderOpts {
  classify?: (
    req: ClassifyBatchRequest,
  ) => Promise<ClassifiedSegment[] | { blocked: true; reason: string }>;
  generate?: (
    req: TaxonomyRequest,
  ) => Promise<ProposedTaxonomyAdditions | { blocked: true; reason: string }>;
}

function makeFakeProvider(opts: FakeProviderOpts = {}) {
  const generate = vi.fn(
    opts.generate ??
      (async () => ({ newCategories: [], newSubcategories: [] })),
  );
  const classify = vi.fn(
    opts.classify ??
      (async (req: ClassifyBatchRequest) =>
        req.segments.map(() => ({
          category: 'Work',
          subcategory: 'Coding',
          confidence: 0.9,
        }))),
  );
  const provider: ClassificationProvider = {
    generateTaxonomy: generate,
    classifyBatch: classify,
  };
  return { provider, generate, classify };
}

const CONFIG = {
  taxonomyModel: 'taxonomy-m',
  classifyModel: 'classify-m',
  batchSize: 10,
  maxConcurrency: 5,
  apiKey: null,
  aiMode: 'byo-key' as const,
};

function makeSample(
  i: number,
  ts: number,
  activity: string,
  app: string,
  window: string,
): Sample {
  return {
    id: i,
    ts,
    activity,
    confidence: 0.9,
    focusedApp: app,
    focusedWindow: window,
  };
}

describe('classifySegments', () => {
  test('skipTaxonomyPass: true bypasses generateTaxonomy and uses existingTaxonomy', async () => {
    const { provider, generate, classify } = makeFakeProvider();
    const samples = [
      makeSample(0, 1_000, 'Editing index.ts', 'Cursor', 'index.ts'),
      makeSample(1, 11_000, 'Editing index.ts', 'Cursor', 'index.ts'),
    ];
    const result = await classifySegments({
      samples,
      existingTaxonomy: TAXONOMY,
      config: CONFIG,
      provider,
      skipTaxonomyPass: true,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(classify).toHaveBeenCalledTimes(1);
    expect(result.taxonomy).toEqual(TAXONOMY);
    expect(result.classifications).toHaveLength(1);
  });

  test('skipTaxonomyPass: true + null existingTaxonomy yields empty taxonomy and Other classifications', async () => {
    const { provider, generate, classify } = makeFakeProvider();
    const samples = [
      makeSample(0, 1_000, 'Editing index.ts', 'Cursor', 'index.ts'),
    ];
    const result = await classifySegments({
      samples,
      existingTaxonomy: null,
      config: CONFIG,
      provider,
      skipTaxonomyPass: true,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled(); // empty taxonomy short-circuits Pass 2
    expect(result.taxonomy).toEqual({ categories: [] });
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].category).toBeNull();
  });

  test('without skipTaxonomyPass, generateTaxonomy is called and its merge feeds Pass 2', async () => {
    const { provider, generate, classify } = makeFakeProvider({
      generate: async () => ({
        newCategories: [{ name: 'Work', subcategories: ['Coding'] }],
        newSubcategories: [],
      }),
    });
    const samples = [
      makeSample(0, 1_000, 'Editing index.ts', 'Cursor', 'index.ts'),
    ];
    const result = await classifySegments({
      samples,
      existingTaxonomy: null,
      config: CONFIG,
      provider,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(result.taxonomy.categories).toHaveLength(1);
    expect(result.taxonomy.categories[0].name).toBe('Work');
  });

  test('attachActivities deduplicates activities per segment and filters DLP-blocked entries', async () => {
    const { provider, classify } = makeFakeProvider();
    // Two samples in the same segment, one duplicate activity + one blocked.
    const samples = [
      makeSample(0, 1_000, 'Editing index.ts', 'Cursor', 'index.ts'),
      makeSample(1, 11_000, 'Editing index.ts', 'Cursor', 'index.ts'),
      makeSample(2, 21_000, DLP_BLOCKED_ACTIVITY, 'Cursor', 'index.ts'),
      makeSample(3, 31_000, 'Running pnpm test', 'Cursor', 'index.ts'),
    ];
    const result = await classifySegments({
      samples,
      existingTaxonomy: TAXONOMY,
      config: CONFIG,
      provider,
      skipTaxonomyPass: true,
    });
    expect(result.enrichedSegments).toHaveLength(1);
    const activities = result.enrichedSegments[0].activities;
    expect(activities).toHaveLength(2);
    expect(activities).toContain('Editing index.ts');
    expect(activities).toContain('Running pnpm test');
    expect(activities).not.toContain(DLP_BLOCKED_ACTIVITY);
    // Provider also receives the deduped/filtered activities.
    expect(classify.mock.calls[0][0].segments[0].activities).toEqual(
      activities,
    );
  });

  test('passes userContext from config through to Pass 2', async () => {
    const { provider, classify } = makeFakeProvider();
    const samples = [
      makeSample(0, 1_000, 'Editing index.ts', 'Cursor', 'index.ts'),
    ];
    await classifySegments({
      samples,
      existingTaxonomy: TAXONOMY,
      config: { ...CONFIG, userContext: 'User is a founder.' },
      provider,
      skipTaxonomyPass: true,
    });
    expect(classify.mock.calls[0][0].userContext).toBe('User is a founder.');
  });

  test('byo-key without apiKey and no provider override throws', async () => {
    await expect(
      classifySegments({
        samples: [makeSample(0, 1_000, 'a', 'Cursor', 'w')],
        existingTaxonomy: TAXONOMY,
        config: { ...CONFIG, apiKey: null, aiMode: 'byo-key' },
        skipTaxonomyPass: true,
      }),
    ).rejects.toThrow(/BYO mode requires apiKey/);
  });

  test('provider override bypasses pickProvider apiKey check', async () => {
    const { provider } = makeFakeProvider();
    // No apiKey — would normally throw, but the override should be honored.
    const result = await classifySegments({
      samples: [makeSample(0, 1_000, 'a', 'Cursor', 'w')],
      existingTaxonomy: TAXONOMY,
      config: { ...CONFIG, apiKey: null, aiMode: 'byo-key' },
      provider,
      skipTaxonomyPass: true,
    });
    expect(result.classifications).toHaveLength(1);
  });
});
