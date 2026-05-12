import { LOG_BUFFER_SIZE, type LogEntry } from '@shared/types';
import { useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';

const VISIBLE_LOG_ROWS = 200;

const LOG_LEVEL_COLOR: Record<LogEntry['level'], string> = {
  log: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

// Entries arrive in monotonic id order on a single channel; a same-or-older
// id is either a duplicate (snapshot/live race) or out-of-order noise. Tail
// compare is O(1).
function appendLive(prev: LogEntry[], entry: LogEntry): LogEntry[] {
  const last = prev[prev.length - 1];
  if (last && entry.id <= last.id) return prev;
  return [...prev, entry].slice(-LOG_BUFFER_SIZE);
}

function mergeSnapshot(prev: LogEntry[], snapshot: LogEntry[]): LogEntry[] {
  if (prev.length === 0) return snapshot;
  const firstLiveId = prev[0].id;
  const prefix: LogEntry[] = [];
  for (const entry of snapshot) {
    if (entry.id >= firstLiveId) break;
    prefix.push(entry);
  }
  return [...prefix, ...prev].slice(-LOG_BUFFER_SIZE);
}

export function ProcessLogs() {
  const [processLogs, setProcessLogs] = useState<LogEntry[]>([]);

  useMountEffect(() => {
    // Subscribe before fetching the snapshot — otherwise entries emitted
    // between the snapshot resolve and the listener registration would be
    // lost.
    const unsubscribe = window.slowblink.onProcessLog((entry) => {
      setProcessLogs((prev) => appendLive(prev, entry));
    });
    void window.slowblink.getProcessLogs().then((snapshot) => {
      setProcessLogs((prev) => mergeSnapshot(prev, snapshot));
    });
    return unsubscribe;
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
            .slice(-VISIBLE_LOG_ROWS)
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
