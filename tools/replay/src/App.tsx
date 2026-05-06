import { type EffectCallback, useEffect, useState } from 'react';

type Outcome = 'success' | 'dlp_blocked' | 'error';
type FilterValue = 'all' | Outcome;

interface CaptureListRow {
  id: string;
  sample_id: number | null;
  captured_at: number;
  request_started_at: number | null;
  response_received_at: number | null;
  provider: string;
  model: string | null;
  outcome: Outcome;
  error_message: string | null;
  focused_app: string | null;
  focused_window: string | null;
  image_size_bytes: number | null;
}

interface CaptureDetail extends CaptureListRow {
  request: unknown;
  response: unknown;
  parsed_result: unknown;
}

const PAGE_SIZE = 50;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'dlp_blocked', label: 'Blocked' },
  { value: 'error', label: 'Error' },
];

const OUTCOME_THEME: Record<Outcome, { fg: string; bg: string }> = {
  success: { fg: '#3ecf8e', bg: '#3ecf8e22' },
  dlp_blocked: { fg: '#f5a623', bg: '#f5a62322' },
  error: { fg: '#e15a5a', bg: '#e15a5a22' },
};

const EMPTY_VALUE = '—';

function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(effect, []);
}

async function fetchCaptures(
  outcome: FilterValue,
  before: number | null,
): Promise<CaptureListRow[]> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (outcome !== 'all') params.set('outcome', outcome);
  if (before !== null) params.set('before', String(before));
  const res = await fetch(`/api/captures?${params.toString()}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const json = (await res.json()) as { captures: CaptureListRow[] };
  return json.captures;
}

async function fetchCapture(id: string): Promise<CaptureDetail> {
  const res = await fetch(`/api/captures/${id}`);
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  const json = (await res.json()) as { capture: CaptureDetail };
  return json.capture;
}

async function clearAll(): Promise<{ rows: number; files: number }> {
  const res = await fetch('/api/clear', { method: 'POST' });
  if (!res.ok) throw new Error(`clear failed: ${res.status}`);
  return (await res.json()) as { rows: number; files: number };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatLatency(start: number | null, end: number | null): string {
  if (start === null || end === null) return EMPTY_VALUE;
  return `${end - start} ms`;
}

export function App() {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [captures, setCaptures] = useState<CaptureListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaptureDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function changeFilter(next: FilterValue) {
    if (next === filter) return;
    setFilter(next);
    setListError(null);
  }

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

  async function onClear() {
    if (!confirm('Delete all captured rows and JPEGs? This cannot be undone.'))
      return;
    try {
      const result = await clearAll();
      alert(`Cleared ${result.rows} row(s) and ${result.files} file(s).`);
      setCaptures([]);
      setSelectedId(null);
      setDetail(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(
        `Clear failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          borderBottom: '1px solid #222',
          background: '#0f0f0f',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              type="button"
              key={f.value}
              onClick={() => changeFilter(f.value)}
              style={{
                padding: '4px 12px',
                background: filter === f.value ? '#2a2a2a' : 'transparent',
                color: filter === f.value ? '#fff' : '#999',
                border: '1px solid #333',
                borderRadius: 4,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          style={{
            marginLeft: 'auto',
            padding: '4px 12px',
            background: '#3a1a1a',
            color: '#ff8a8a',
            border: '1px solid #5a2a2a',
            borderRadius: 4,
          }}
        >
          Clear all
        </button>
      </header>
      <CaptureListLoader
        key={`${filter}-${refreshKey}`}
        filter={filter}
        currentSelectedId={selectedId}
        onLoaded={setCaptures}
        onAutoSelect={setSelectedId}
        onError={setListError}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          minHeight: 0,
        }}
      >
        <ListPane
          captures={captures}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onLoadMore={loadMore}
          error={listError}
        />
        <DetailPane detail={detail} />
      </div>
      <CaptureDetailLoader
        key={selectedId ?? 'none'}
        id={selectedId}
        onLoaded={setDetail}
      />
    </div>
  );
}

function CaptureListLoader({
  filter,
  currentSelectedId,
  onLoaded,
  onAutoSelect,
  onError,
}: {
  filter: FilterValue;
  currentSelectedId: string | null;
  onLoaded: (rows: CaptureListRow[]) => void;
  onAutoSelect: (id: string | null) => void;
  onError: (msg: string) => void;
}) {
  useMountEffect(() => {
    void fetchCaptures(filter, null)
      .then((rows) => {
        onLoaded(rows);
        if (rows.length === 0) {
          onAutoSelect(null);
          return;
        }
        const stillSelected = rows.find((r) => r.id === currentSelectedId);
        if (!stillSelected) onAutoSelect(rows[0]?.id ?? null);
      })
      .catch((err) => onError(String(err)));
  });
  return null;
}

function CaptureDetailLoader({
  id,
  onLoaded,
}: {
  id: string | null;
  onLoaded: (d: CaptureDetail | null) => void;
}) {
  useMountEffect(() => {
    if (!id) {
      onLoaded(null);
      return;
    }
    let cancelled = false;
    fetchCapture(id)
      .then((d) => {
        if (!cancelled) onLoaded(d);
      })
      .catch(() => {
        if (!cancelled) onLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  });
  return null;
}

function ListPane(props: {
  captures: CaptureListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  error: string | null;
}) {
  const { captures, selectedId, onSelect, onLoadMore, error } = props;
  return (
    <div
      style={{
        borderRight: '1px solid #222',
        overflowY: 'auto',
        background: '#0c0c0c',
      }}
    >
      {error && <div style={{ padding: 12, color: '#e15a5a' }}>{error}</div>}
      {captures.length === 0 && !error && (
        <div style={{ padding: 16, color: '#666', fontSize: 13 }}>
          No captures yet. Toggle "Replay logging" on in the Electron Dev tab,
          then run a capture.
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
            background: selectedId === c.id ? '#1a1a2a' : 'transparent',
            border: 'none',
            borderBottom: '1px solid #181818',
            color: '#e7e7e7',
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
            <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
              {c.focused_app ?? '(no app)'}
            </span>
            <span
              style={{
                fontSize: 13,
                color: '#888',
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
              fontSize: 11,
              color: '#666',
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
            color: '#888',
            border: 'none',
            borderTop: '1px solid #222',
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}

function DetailPane({ detail }: { detail: CaptureDetail | null }) {
  if (!detail) {
    return (
      <div style={{ padding: 24, color: '#666' }}>
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
          value={detail.sample_id !== null ? `#${detail.sample_id}` : EMPTY_VALUE}
        />
      </div>

      {detail.error_message && (
        <Section title="Error">
          <pre style={{ color: '#ff8a8a' }}>{detail.error_message}</pre>
        </Section>
      )}

      <Section title="Screenshot">
        {hasImage ? (
          <img
            src={`/captures/${detail.id}.jpg`}
            alt="capture"
            style={{
              maxWidth: '100%',
              border: '1px solid #222',
              borderRadius: 4,
            }}
          />
        ) : (
          <div
            style={{
              padding: 24,
              border: '1px dashed #333',
              borderRadius: 4,
              color: '#666',
              fontSize: 13,
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
          fontSize: 11,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#e7e7e7' }}>{value}</div>
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
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#888',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          padding: 12,
          background: '#111',
          border: '1px solid #222',
          borderRadius: 4,
        }}
      >
        {children}
      </div>
    </div>
  );
}
