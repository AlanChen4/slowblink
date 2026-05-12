import { useRef, useState } from 'react';
import {
  type CaptureDetail,
  type CaptureListRow,
  EMPTY_VALUE,
  type FilterValue,
  fetchCapture,
  fetchCaptures,
  formatLatency,
  formatTime,
  OUTCOME_THEME,
  PAGE_SIZE,
  POLL_INTERVAL_MS,
  useMountEffect,
} from '../api';

interface Props {
  filter: FilterValue;
}

function mergeRows(
  previous: CaptureListRow[],
  fresh: CaptureListRow[],
): CaptureListRow[] {
  if (previous.length === 0) return fresh;
  const previousIds = new Set(previous.map((r) => r.id));
  const newRows = fresh.filter((r) => !previousIds.has(r.id));
  if (newRows.length === 0) return previous;
  return [...newRows, ...previous];
}

function nextSelection(
  previous: CaptureListRow[],
  merged: CaptureListRow[],
  currentSelected: string | null,
): string | null {
  const newTopId = merged[0]?.id ?? null;
  if (newTopId === null) return null;
  if (currentSelected === null) return newTopId;
  const stillInList = merged.some((r) => r.id === currentSelected);
  if (!stillInList) return newTopId;
  const previousTopId = previous[0]?.id ?? null;
  const haveNewerRows = previousTopId !== null && newTopId !== previousTopId;
  if (haveNewerRows && currentSelected === previousTopId) return newTopId;
  return currentSelected;
}

export function CapturesView({ filter }: Props) {
  const [captures, setCaptures] = useState<CaptureListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const capturesRef = useRef(captures);
  capturesRef.current = captures;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  async function refresh() {
    try {
      const fresh = await fetchCaptures(filter, null);
      const previous = capturesRef.current;
      const merged = mergeRows(previous, fresh);
      setCaptures(merged);
      const next = nextSelection(previous, merged, selectedRef.current);
      if (next !== selectedRef.current) setSelectedId(next);
    } catch (err) {
      setListError(String(err));
    }
  }

  useMountEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  });

  async function loadMore() {
    const oldest = captures[captures.length - 1];
    if (!oldest) return;
    try {
      const more = await fetchCaptures(filter, oldest.captured_at);
      setCaptures((prev) => [...prev, ...more]);
    } catch (err) {
      setListError(String(err));
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        minHeight: 0,
        height: '100%',
      }}
    >
      <ListPane
        captures={captures}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onLoadMore={loadMore}
        error={listError}
      />
      <DetailPane key={selectedId ?? 'none'} id={selectedId} />
    </div>
  );
}

function ListPane({
  captures,
  selectedId,
  onSelect,
  onLoadMore,
  error,
}: {
  captures: CaptureListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  error: string | null;
}) {
  return (
    <div
      style={{
        borderRight: '1px solid var(--border-soft)',
        overflowY: 'auto',
        background: 'var(--bg-subtle)',
      }}
    >
      {error && (
        <div style={{ padding: 12, color: 'var(--accent-error-fg)' }}>
          {error}
        </div>
      )}
      {captures.length === 0 && !error && (
        <div style={{ padding: 16, color: 'var(--text-muted)' }}>
          No captures yet. Trigger one from the running Electron app or click
          "Capture".
        </div>
      )}
      {captures.map((c) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onSelect(c.id)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            background:
              selectedId === c.id ? 'var(--bg-selected)' : 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border-faint)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: OUTCOME_THEME[c.outcome].fg,
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 500, flexShrink: 0 }}>
              {c.focused_app ?? '(no app)'}
            </span>
            <span
              style={{
                color: 'var(--text-tertiary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {c.focused_window ?? '(no window)'}
            </span>
          </div>
          <div
            style={{
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            {formatTime(c.captured_at)}
          </div>
        </button>
      ))}
      {captures.length > 0 && captures.length % PAGE_SIZE === 0 && (
        <button
          type="button"
          onClick={onLoadMore}
          style={{
            display: 'block',
            width: '100%',
            padding: 8,
            background: 'transparent',
            color: 'var(--text-tertiary)',
            border: 'none',
            borderTop: '1px solid var(--border-soft)',
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}

function DetailPane({ id }: { id: string | null }) {
  const [detail, setDetail] = useState<CaptureDetail | null>(null);

  useMountEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchCapture(id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  });

  if (!detail) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)' }}>
        Select a capture to inspect.
      </div>
    );
  }
  const hasImage = detail.image_size_bytes !== null;
  return (
    <div style={{ overflowY: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
        <DetailStat label="Provider" value={detail.provider} />
        <DetailStat label="Model" value={detail.model ?? EMPTY_VALUE} />
        <DetailStat
          label="Latency"
          value={formatLatency(
            detail.request_started_at,
            detail.response_received_at,
          )}
        />
        <DetailStat
          label="Sample"
          value={
            detail.sample_id !== null ? `#${detail.sample_id}` : EMPTY_VALUE
          }
        />
      </div>

      {detail.error_message && (
        <Section title="Error">
          <pre style={{ color: 'var(--accent-error-fg)' }}>
            {detail.error_message}
          </pre>
        </Section>
      )}

      <Section title="Screenshot">
        {hasImage ? (
          <img
            src={`/captures/${detail.id}.jpg`}
            alt="capture"
            style={{
              maxWidth: '100%',
              border: '1px solid var(--border-soft)',
              borderRadius: 4,
            }}
          />
        ) : (
          <div
            style={{
              padding: 24,
              border: '1px dashed var(--border-strong)',
              borderRadius: 4,
              color: 'var(--text-muted)',
            }}
          >
            No screenshot — capture failed before the image was produced.
          </div>
        )}
      </Section>

      <Section title="Request">
        <pre>{JSON.stringify(detail.request, null, 2)}</pre>
      </Section>

      {detail.parsed_result !== null && (
        <Section title="Parsed result">
          <pre>{JSON.stringify(detail.parsed_result, null, 2)}</pre>
        </Section>
      )}

      <Section title="Response">
        <pre>{JSON.stringify(detail.response, null, 2)}</pre>
      </Section>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        style={{
          margin: '0 0 8px',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--text-tertiary)',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          padding: 12,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-soft)',
          borderRadius: 4,
        }}
      >
        {children}
      </div>
    </div>
  );
}
