import type { AppDuration } from '@shared/types';

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
}

export const MIN_DURATION_MS = 60_000;

export function filterApps(apps: AppDuration[]): AppDuration[] {
  return apps
    .map((a) => ({
      ...a,
      windows: a.windows.filter((w) => w.durationMs >= MIN_DURATION_MS),
    }))
    .filter((a) => a.durationMs >= MIN_DURATION_MS || a.windows.length > 0);
}
