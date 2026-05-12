import { useMemo, useState } from 'react';
import { fetchLogs, type LogEntry, startPolling, useMountEffect } from '../api';

const POLL_MS = 2000;
const VISIBLE_LOG_ROWS = 500;

const LOG_LEVEL_COLOR: Record<LogEntry['level'], string> = {
  log: 'var(--log-info-fg)',
  info: 'var(--log-info-fg)',
  debug: 'var(--log-debug-fg)',
  warn: 'var(--log-warn-fg)',
  error: 'var(--log-error-fg)',
};

function mergeEntries(prev: LogEntry[], fresh: LogEntry[]): LogEntry[] {
  if (prev.length === 0) return fresh;
  const prevIds = new Set(prev.map((e) => e.id));
  const novel = fresh.filter((e) => !prevIds.has(e.id));
  if (novel.length === 0) return prev;
  const merged = [...prev, ...novel].sort((a, b) => a.id - b.id);
  return merged.slice(-VISIBLE_LOG_ROWS);
}

async function copyToClipboard(entries: LogEntry[]): Promise<void> {
  const text = entries
    .map((e) => {
      const time = new Date(e.ts).toLocaleTimeString();
      return `${time} [${e.level}] ${e.message}`;
    })
    .join('\n');
  await navigator.clipboard.writeText(text);
}

export function LogsView() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reversed = useMemo(() => entries.slice().reverse(), [entries]);

  useMountEffect(() =>
    startPolling(fetchLogs, POLL_MS, {
      onValue: ({ entries: fresh }) => {
        setError((prev) => (prev === null ? prev : null));
        setEntries((prev) => mergeEntries(prev, fresh));
      },
      onError: setError,
    }),
  );

  async function onCopy() {
    try {
      await copyToClipboard(entries);
    } catch (err) {
      setError(
        `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-soft)',
          background: 'var(--bg-subtle)',
          color: 'var(--text-tertiary)',
        }}
      >
        <span>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} (latest{' '}
          {VISIBLE_LOG_ROWS})
        </span>
        <button
          type="button"
          onClick={() => {
            void onCopy();
          }}
          disabled={entries.length === 0}
          style={{
            padding: '3px 10px',
            background:
              entries.length === 0 ? 'transparent' : 'var(--bg-button-subtle)',
            color:
              entries.length === 0
                ? 'var(--text-disabled)'
                : 'var(--text-secondary)',
            border: '1px solid var(--border-mid)',
            borderRadius: 4,
            cursor: entries.length === 0 ? 'default' : 'pointer',
          }}
        >
          Copy all
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: '12px 16px' }}>
        {error && (
          <div
            style={{
              color: 'var(--accent-error-fg)',
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        {entries.length === 0 && !error && (
          <div style={{ color: 'var(--text-muted)' }}>
            No log lines from the main process yet.
          </div>
        )}
        <div style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}>
          {reversed.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '2px 0',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span
                style={{
                  color: LOG_LEVEL_COLOR[entry.level],
                  wordBreak: 'break-word',
                  minWidth: 0,
                }}
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
