import type { LogEntry } from '@shared/types';
import { useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';

const LOG_LEVEL_COLOR: Record<LogEntry['level'], string> = {
  log: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

export function ProcessLogs() {
  const [processLogs, setProcessLogs] = useState<LogEntry[]>([]);

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
    <div className="space-y-2">
      <p className="font-medium text-sm">Process logs</p>
      {processLogs.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No log lines from the main process yet.
        </p>
      ) : (
        <div className="max-h-96 space-y-0.5 overflow-y-auto rounded-md border border-muted-foreground/40 border-dashed p-3 font-mono text-xs">
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
  );
}
