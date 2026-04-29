import type { OverviewAggregate } from '@shared/types';
import { formatDuration } from './format';

interface Props {
  aggregate: OverviewAggregate;
  minDurationMs: number;
}

export function TopApps({ aggregate, minDurationMs }: Props) {
  const apps = aggregate.apps
    .map((a) => ({
      ...a,
      windows: a.windows.filter((w) => w.durationMs >= minDurationMs),
    }))
    .filter((a) => a.durationMs >= minDurationMs || a.windows.length > 0);

  if (apps.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Top apps</h2>
        <p className="text-muted-foreground text-sm">
          No app activity above the current threshold.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Top apps</h2>
      <ul className="space-y-3">
        {apps.map((a) => (
          <li key={a.app} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium text-sm">{a.app}</span>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {formatDuration(a.durationMs)}
              </span>
            </div>
            {a.windows.length > 0 && (
              <ul className="space-y-1 pl-3">
                {a.windows.map((w) => (
                  <li
                    key={w.window}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                      {w.window}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                      {formatDuration(w.durationMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
