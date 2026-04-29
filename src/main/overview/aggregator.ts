import type {
  AppDuration,
  OverviewAggregate,
  Segment,
  WindowDuration,
} from '../../shared/types';

export function aggregate(segments: Segment[]): OverviewAggregate {
  const appMs = new Map<string, number>();
  const windowMsByApp = new Map<string, Map<string, number>>();

  for (const seg of segments) {
    if (seg.focusedApp === null) continue;
    const app = seg.focusedApp;
    appMs.set(app, (appMs.get(app) ?? 0) + seg.durationMs);

    if (seg.focusedWindow) {
      const map = windowMsByApp.get(app) ?? new Map<string, number>();
      map.set(
        seg.focusedWindow,
        (map.get(seg.focusedWindow) ?? 0) + seg.durationMs,
      );
      windowMsByApp.set(app, map);
    }
  }

  const apps: AppDuration[] = [...appMs.entries()]
    .map(([app, durationMs]) => {
      const map = windowMsByApp.get(app) ?? new Map<string, number>();
      const windows: WindowDuration[] = [...map.entries()]
        .map(([window, durationMsW]) => ({ window, durationMs: durationMsW }))
        .sort((a, b) => b.durationMs - a.durationMs);
      return { app, durationMs, windows };
    })
    .sort((a, b) => b.durationMs - a.durationMs);

  return { apps };
}
