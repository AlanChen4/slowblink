import { describe, expect, test } from 'vitest';
import type { Sample } from '../../shared/types';
import {
  IDLE_GAP_MS,
  normalizeFocusedWindow,
  samplesToSegments,
} from './segmenter';
import {
  seedAudioPlayingFlicker,
  seedBrowserHeavyDay,
  seedCodingDay,
  seedCounterPrefix,
  seedEmpty,
  seedIdleGaps,
} from './testing/seeds';

describe('normalizeFocusedWindow', () => {
  test('strips browser status notifications', () => {
    expect(
      normalizeFocusedWindow(
        'Some Video - YouTube - Audio playing - Brave - Lumos Fellows',
        'Brave Browser',
      ),
    ).toBe('Some Video - YouTube');
  });

  test('strips notification counter prefix', () => {
    expect(
      normalizeFocusedWindow('(3) Inbox - Gmail - Brave', 'Brave Browser'),
    ).toBe('Inbox - Gmail');
  });

  test('strips trailing browser + profile suffix', () => {
    expect(
      normalizeFocusedWindow(
        'Page Title - Brave - Lumos Fellows',
        'Brave Browser',
      ),
    ).toBe('Page Title');
  });

  test('audio-playing and non-audio-playing variants normalize to the same key', () => {
    const a = normalizeFocusedWindow(
      'X - YouTube - Audio playing - Brave - Lumos Fellows',
      'Brave Browser',
    );
    const b = normalizeFocusedWindow(
      'X - YouTube - Brave - Lumos Fellows',
      'Brave Browser',
    );
    expect(a).toBe(b);
  });

  test('does not strip browser suffix when app is not a known browser', () => {
    expect(
      normalizeFocusedWindow('something - Brave - Lumos Fellows', 'Cursor'),
    ).toBe('something - Brave - Lumos Fellows');
  });

  test('returns null for null input', () => {
    expect(normalizeFocusedWindow(null, 'Brave Browser')).toBeNull();
  });
});

describe('samplesToSegments', () => {
  test('empty input produces no segments', () => {
    expect(samplesToSegments(seedEmpty())).toEqual([]);
  });

  test('single sample produces one segment with a default trailing interval', () => {
    const sample: Sample = {
      id: 1,
      ts: 1000,
      activity: 'typing',
      confidence: 0.9,
      focusedApp: 'Cursor',
      focusedWindow: 'a.ts',
    };
    const segments = samplesToSegments([sample]);
    expect(segments).toHaveLength(1);
    expect(segments[0].startTs).toBe(1000);
    expect(segments[0].durationMs).toBeGreaterThan(0);
    expect(segments[0].focusedApp).toBe('Cursor');
    expect(segments[0].focusedWindow).toBe('a.ts');
  });

  test('seedCodingDay: no window changes → single long segment', () => {
    const segments = samplesToSegments(seedCodingDay({ hours: 2 }));
    expect(segments).toHaveLength(1);
    expect(segments[0].focusedApp).toBe('Cursor');
    expect(segments[0].focusedWindow).toBe('segmenter.ts — slowblink');
    expect(segments[0].durationMs).toBeGreaterThan(60 * 60_000);
  });

  test('seedBrowserHeavyDay: four distinct windows produce ≥4 segments, each with distinct focusedWindow', () => {
    const segments = samplesToSegments(seedBrowserHeavyDay());
    expect(segments.length).toBeGreaterThanOrEqual(4);
    const windows = segments.map((s) => s.focusedWindow).filter(Boolean);
    const unique = new Set(windows);
    expect(unique.size).toBeGreaterThanOrEqual(4);
    for (const seg of segments) {
      if (seg.focusedApp !== null) {
        expect(seg.focusedApp).toBe('Brave Browser');
      }
    }
  });

  test('seedAudioPlayingFlicker: alternating audio-playing variants merge into one segment', () => {
    const segments = samplesToSegments(seedAudioPlayingFlicker());
    expect(segments).toHaveLength(1);
    expect(segments[0].focusedApp).toBe('Brave Browser');
    // The trailing " - Brave - Lumos Fellows" suffix and " - Audio playing"
    // status should be stripped, leaving the page title + site.
    expect(segments[0].focusedWindow).toMatch(/YouTube$/);
  });

  test('seedCounterPrefix: cycling unread-count prefix collapses to one segment', () => {
    const segments = samplesToSegments(seedCounterPrefix());
    expect(segments).toHaveLength(1);
    expect(segments[0].focusedWindow).toBe('Inbox — Gmail');
  });

  test('seedIdleGaps: produces idle segments where gaps exceed IDLE_GAP_MS', () => {
    const segments = samplesToSegments(seedIdleGaps());
    const idle = segments.filter(
      (s) => s.focusedApp === null && s.focusedWindow === null,
    );
    expect(idle.length).toBeGreaterThanOrEqual(2);
    for (const s of idle) {
      expect(s.durationMs).toBeGreaterThan(0);
      expect(s.focusedApp).toBeNull();
      expect(s.focusedWindow).toBeNull();
    }
  });

  test('segments never carry category/activity', () => {
    const segments = samplesToSegments(seedBrowserHeavyDay());
    for (const s of segments) {
      expect(s).not.toHaveProperty('activity');
      expect(s).not.toHaveProperty('category');
    }
  });

  test('gap below IDLE_GAP_MS does not trigger idle segment', () => {
    const ts = 1000;
    const samples: Sample[] = [
      {
        id: 1,
        ts,
        activity: 'a',
        confidence: 0.9,
        focusedApp: 'App',
        focusedWindow: 'W',
      },
      {
        id: 2,
        ts: ts + IDLE_GAP_MS - 1,
        activity: 'a',
        confidence: 0.9,
        focusedApp: 'App',
        focusedWindow: 'W',
      },
    ];
    const segments = samplesToSegments(samples);
    expect(segments).toHaveLength(1);
    expect(segments[0].focusedApp).toBe('App');
  });

  test('perf: 8hr coding day segments in <50ms', () => {
    const samples = seedCodingDay({ hours: 8 });
    const t0 = performance.now();
    samplesToSegments(samples);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});
