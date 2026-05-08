import { describe, expect, test } from 'vitest';
import type { OverviewAggregate } from '../../shared/types';
import { mergeIconsIntoAggregate } from './enrich-icons';

function fakeAggregate(apps: string[]): OverviewAggregate {
  return {
    apps: apps.map((app) => ({
      app,
      durationMs: 1000,
      windows: [],
      iconDataUrl: null,
    })),
  };
}

describe('mergeIconsIntoAggregate', () => {
  test('without local or remote icons, every app keeps iconDataUrl: null', () => {
    const agg = fakeAggregate(['Safari', 'Cursor']);
    const merged = mergeIconsIntoAggregate(agg, new Map(), new Map());
    expect(merged.apps.map((a) => a.iconDataUrl)).toEqual([null, null]);
  });

  test('local icons populate iconDataUrl', () => {
    const agg = fakeAggregate(['Safari', 'Cursor']);
    const local = new Map([['Safari', { dataUrl: 'data:s', updatedAt: 1 }]]);
    const merged = mergeIconsIntoAggregate(agg, local, new Map());
    expect(merged.apps[0].iconDataUrl).toBe('data:s');
    expect(merged.apps[1].iconDataUrl).toBeNull();
  });

  test('remote icons fill in apps the local cache is missing', () => {
    const agg = fakeAggregate(['Safari', 'Cursor']);
    const remote = new Map([['Cursor', 'data:c-remote']]);
    const merged = mergeIconsIntoAggregate(agg, new Map(), remote);
    expect(merged.apps[0].iconDataUrl).toBeNull();
    expect(merged.apps[1].iconDataUrl).toBe('data:c-remote');
  });

  test('local takes precedence over remote when both have a name', () => {
    const agg = fakeAggregate(['Safari']);
    const local = new Map([
      ['Safari', { dataUrl: 'data:s-local', updatedAt: 1 }],
    ]);
    const remote = new Map([['Safari', 'data:s-remote']]);
    const merged = mergeIconsIntoAggregate(agg, local, remote);
    expect(merged.apps[0].iconDataUrl).toBe('data:s-local');
  });

  test('does not mutate the input aggregate', () => {
    const agg = fakeAggregate(['Safari']);
    const local = new Map([['Safari', { dataUrl: 'data:s', updatedAt: 1 }]]);
    mergeIconsIntoAggregate(agg, local, new Map());
    expect(agg.apps[0].iconDataUrl).toBeNull();
  });
});
