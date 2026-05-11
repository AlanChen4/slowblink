import type { LogEntry, Sample } from '@shared/types';
import { useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { startOfDay } from '@/lib/categories';

const LOG_LEVEL_COLOR: Record<LogEntry['level'], string> = {
  log: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

export function Logs() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [processLogs, setProcessLogs] = useState<LogEntry[]>([]);
  const [dayStart] = useState(() => startOfDay());

  useMountEffect(() => {
    let lastSeenId: number | null = null;
    let lastSeenLength = 0;
    const refresh = async () => {
      const next = await window.slowblink.getSamples(dayStart, Date.now());
      const newest = next.length > 0 ? next[next.length - 1].id : null;
      if (next.length === lastSeenLength && newest === lastSeenId) return;
      lastSeenLength = next.length;
      lastSeenId = newest;
      setSamples(next);
    };
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 5_000);
    return () => clearInterval(t);
  });

  useMountEffect(() => {
    void window.slowblink.getProcessLogs().then(setProcessLogs);
    return window.slowblink.onProcessLog((entry) => {
      setProcessLogs((prev) => {
        // A `getProcessLogs()` race or a stale buffer can hand us an
        // entry we already have — dedup by id so React keys stay unique.
        if (prev.some((e) => e.id === entry.id)) return prev;
        const trimmed =
          prev.length >= 500 ? prev.slice(prev.length - 499) : prev;
        return [...trimmed, entry];
      });
    });
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="flex min-h-0 flex-col">
        <h2 className="font-semibold text-lg">Process logs</h2>
        <div className="mt-4 min-h-0 flex-1">
          {processLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No log lines from the main process yet.
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto font-mono text-xs">
              {processLogs
                .slice(-200)
                .reverse()
                .map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <span
                      className={`min-w-0 break-all ${LOG_LEVEL_COLOR[entry.level]}`}
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col">
        <h2 className="font-semibold text-lg">Samples</h2>
        <div className="mt-4">
          {samples.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No samples yet. Make sure permissions and API key are set, then
              wait for the first capture.
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
              {samples
                .slice(-50)
                .reverse()
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                      {new Date(s.ts).toLocaleTimeString()}
                    </span>
                    <span className="w-24 shrink-0 truncate text-muted-foreground">
                      {s.focusedApp ?? '—'}
                    </span>
                    <span className="min-w-0 truncate">{s.activity}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
