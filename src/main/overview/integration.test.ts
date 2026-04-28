/**
 * Integration tests covering the pure pipeline (segmenter + aggregator)
 * end-to-end on realistic seeds. The full IPC orchestrator ({@link ./index.ts})
 * pulls in Electron and the SQLite DB — those paths need a harness.
 */
import { describe, expect, test } from 'vitest';
import { aggregate } from './aggregator';
import { samplesToSegments } from './segmenter';
import {
  seedAudioPlayingFlicker,
  seedBrowserHeavyDay,
  seedInterruptionPattern,
} from './testing/seeds';

describe('overview integration — browser-heavy grouping', () => {
  test('4 distinct Brave windows surface as separate window entries under one app', () => {
    const samples = seedBrowserHeavyDay();
    const segments = samplesToSegments(samples);
    expect(segments.length).toBeGreaterThanOrEqual(4);

    const agg = aggregate(segments);
    const brave = agg.apps.find((a) => a.app === 'Brave Browser');
    expect(brave).toBeDefined();
    const windowNames = brave!.windows.map((w) => w.window);
    expect(new Set(windowNames).size).toBe(windowNames.length);
    expect(windowNames.length).toBeGreaterThanOrEqual(4);
  });
});

describe('overview integration — brief interruption grouping', () => {
  test('Cursor + Slack + Cursor splits across 3 segments preserved by the aggregator', () => {
    const samples = seedInterruptionPattern();
    const segments = samplesToSegments(samples);
    expect(segments).toHaveLength(3);

    const agg = aggregate(segments);
    const cursor = agg.apps.find((a) => a.app === 'Cursor');
    const slack = agg.apps.find((a) => a.app === 'Slack');
    expect(cursor).toBeDefined();
    expect(slack).toBeDefined();
    // Cursor's two segments combine in the per-app total.
    expect(cursor!.durationMs).toBeGreaterThan(slack!.durationMs);
  });
});

describe('overview integration — focusedWindow normalization', () => {
  test('Audio-playing flicker collapses into a single Brave window entry', () => {
    const samples = seedAudioPlayingFlicker();
    const segments = samplesToSegments(samples);
    expect(segments).toHaveLength(1);

    const agg = aggregate(segments);
    const brave = agg.apps.find((a) => a.app === 'Brave Browser');
    expect(brave).toBeDefined();
    expect(brave!.windows).toHaveLength(1);
    expect(brave!.windows[0].window).toMatch(/YouTube$/);
    expect(brave!.windows[0].durationMs).toBe(brave!.durationMs);
  });
});
