import { describe, expect, test } from 'vitest';
import { aggregate } from './aggregator';
import { samplesToSegments } from './segmenter';
import {
  seedBrowserHeavyDay,
  seedCodingDay,
  seedIdleGaps,
  seedMixedDay,
} from './testing/seeds';

describe('aggregate', () => {
  test('empty segments produce empty aggregate', () => {
    const agg = aggregate([]);
    expect(agg.apps).toEqual([]);
  });

  test('idle segments contribute nothing to apps', () => {
    const agg = aggregate(samplesToSegments(seedIdleGaps()));
    for (const a of agg.apps) {
      expect(a.app).not.toBeNull();
    }
    // Cursor is the only non-idle app in seedIdleGaps.
    expect(agg.apps.length).toBe(1);
    expect(agg.apps[0].app).toBe('Cursor');
  });

  test('apps ranked by durationMs, descending', () => {
    const agg = aggregate(samplesToSegments(seedMixedDay()));
    expect(agg.apps.length).toBeGreaterThan(0);
    // Cursor should dominate the mixed day (90 + 60 = 150 minutes).
    expect(agg.apps[0].app).toBe('Cursor');
    for (let i = 1; i < agg.apps.length; i++) {
      expect(agg.apps[i - 1].durationMs).toBeGreaterThanOrEqual(
        agg.apps[i].durationMs,
      );
    }
  });

  test('windows nest under their app and rank by duration', () => {
    const agg = aggregate(samplesToSegments(seedBrowserHeavyDay()));
    const brave = agg.apps.find((a) => a.app === 'Brave Browser');
    if (!brave) throw new Error('expected Brave Browser app');
    expect(brave.windows.length).toBeGreaterThanOrEqual(4);
    const unique = new Set(brave.windows.map((w) => w.window));
    expect(unique.size).toBe(brave.windows.length);
    for (let i = 1; i < brave.windows.length; i++) {
      expect(brave.windows[i - 1].durationMs).toBeGreaterThanOrEqual(
        brave.windows[i].durationMs,
      );
    }
  });

  test('app durationMs equals sum of its window durations', () => {
    const agg = aggregate(samplesToSegments(seedBrowserHeavyDay()));
    for (const a of agg.apps) {
      const windowSum = a.windows.reduce((acc, w) => acc + w.durationMs, 0);
      expect(windowSum).toBe(a.durationMs);
    }
  });

  test('perf: 8hr seed aggregates in <10ms', () => {
    const segments = samplesToSegments(seedCodingDay({ hours: 8 }));
    const t0 = performance.now();
    aggregate(segments);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(10);
  });
});
