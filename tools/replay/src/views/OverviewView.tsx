import { useMemo, useState } from 'react';
import { aggregate } from '@shared/overview/aggregator';
import { samplesToSegments } from '@shared/overview/segmenter';
import {
  dayStartWithOffset,
  fetchFixture,
  fetchFixtures,
  fetchOverviewDebug,
  type FixtureListEntry,
  fixtureRowsToSamples,
  formatDuration,
  type OverviewAggregate,
  type OverviewDebug,
  type OverviewScope,
  type Sample,
  saveFixture,
  type Segment,
  startPolling,
  useMountEffect,
} from '../api';

function debugUnchanged(a: OverviewDebug, b: OverviewDebug): boolean {
  return (
    a.samples.length === b.samples.length &&
    a.samples.at(-1)?.id === b.samples.at(-1)?.id &&
    a.segments.length === b.segments.length &&
    a.range.startTs === b.range.startTs &&
    a.range.endTs === b.range.endTs &&
    a.range.scope === b.range.scope
  );
}

const POLL_MS = 3000;

function formatDayTitle(offset: number, dayStart: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type Source = { kind: 'live' } | { kind: 'fixture'; name: string };

const EXPORT_DAY_OPTIONS = [1, 3, 7, 14, 30];

export function OverviewView() {
  const [scope, setScope] = useState<OverviewScope>('this-device');
  const [dayOffset, setDayOffset] = useState(0);
  const [source, setSource] = useState<Source>({ kind: 'live' });
  const [fixtures, setFixtures] = useState<FixtureListEntry[]>([]);
  const [exportDays, setExportDays] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useMountEffect(() => {
    void reloadFixtures();
  });

  async function reloadFixtures() {
    try {
      setFixtures(await fetchFixtures());
    } catch {
      // Fixtures endpoint is optional — old replay middleware may not have it.
      setFixtures([]);
    }
  }

  function onLoadFixture(name: string) {
    setSource({ kind: 'fixture', name });
  }

  function onBackToLive() {
    setSource({ kind: 'live' });
  }

  async function onExport() {
    if (exporting) return;
    const earliestOffset = dayOffset + exportDays - 1;
    const earliest = dayStartWithOffset(earliestOffset);
    const latest =
      dayOffset === 0 ? Date.now() : dayStartWithOffset(dayOffset - 1);
    const earliestDate = new Date(earliest).toISOString().slice(0, 10);
    const latestDate = new Date(dayStartWithOffset(dayOffset))
      .toISOString()
      .slice(0, 10);
    const suggested =
      exportDays === 1
        ? `samples-${latestDate}`
        : `samples-${earliestDate}-to-${latestDate}`;
    const name = window.prompt('Save samples as fixture name:', suggested);
    if (!name) return;
    setExporting(true);
    setExportError(null);
    try {
      const debug = await fetchOverviewDebug(earliest, latest, scope);
      if (debug.samples.length === 0) {
        setExportError('No samples in selected range.');
        return;
      }
      await saveFixture(name, debug.samples);
      await reloadFixtures();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  const body =
    source.kind === 'live' ? (
      <LiveBody
        key={`${scope}-${dayOffset}`}
        scope={scope}
        dayOffset={dayOffset}
      />
    ) : (
      <FixtureBody key={source.name} name={source.name} />
    );

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: 0,
      }}
    >
      <Toolbar
        source={source}
        scope={scope}
        dayOffset={dayOffset}
        fixtures={fixtures}
        exportDays={exportDays}
        exporting={exporting}
        exportError={exportError}
        onScopeChange={setScope}
        onDayOffsetChange={setDayOffset}
        onLoadFixture={onLoadFixture}
        onBackToLive={onBackToLive}
        onExportDaysChange={setExportDays}
        onExport={() => {
          void onExport();
        }}
      />
      <div style={{ overflowY: 'auto', padding: '16px' }}>{body}</div>
    </div>
  );
}

interface ToolbarProps {
  source: Source;
  scope: OverviewScope;
  dayOffset: number;
  fixtures: FixtureListEntry[];
  exportDays: number;
  exporting: boolean;
  exportError: string | null;
  onScopeChange: (s: OverviewScope) => void;
  onDayOffsetChange: (n: number) => void;
  onLoadFixture: (name: string) => void;
  onBackToLive: () => void;
  onExportDaysChange: (n: number) => void;
  onExport: () => void;
}

function Toolbar({
  source,
  scope,
  dayOffset,
  fixtures,
  exportDays,
  exporting,
  exportError,
  onScopeChange,
  onDayOffsetChange,
  onLoadFixture,
  onBackToLive,
  onExportDaysChange,
  onExport,
}: ToolbarProps) {
  const isLive = source.kind === 'live';
  const dayStart = dayStartWithOffset(dayOffset);
  const isToday = dayOffset === 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isLive ? (
          <DayNav
            dayOffset={dayOffset}
            dayStart={dayStart}
            isToday={isToday}
            onChange={onDayOffsetChange}
          />
        ) : (
          <BackToLiveButton onClick={onBackToLive} />
        )}
        {!isLive && source.kind === 'fixture' && (
          <span style={{ color: 'var(--text-secondary)' }}>
            Fixture:{' '}
            <code style={{ color: 'var(--text-primary)' }}>{source.name}</code>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {exportError && (
          <span style={{ color: 'var(--accent-error-fg)' }}>{exportError}</span>
        )}
        {isLive && (
          <>
            <ExportDaysSelect
              value={exportDays}
              onChange={onExportDaysChange}
            />
            <ExportButton pending={exporting} onClick={onExport} />
          </>
        )}
        <FixtureSelect
          fixtures={fixtures}
          currentName={source.kind === 'fixture' ? source.name : null}
          onLoad={onLoadFixture}
        />
        {isLive && <ScopeSwitch scope={scope} onChange={onScopeChange} />}
      </div>
    </div>
  );
}

function ExportDaysSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      title="Days of samples to include in export"
      style={{
        height: 24,
        padding: '0 6px',
        background: 'var(--bg-panel)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
      }}
    >
      {EXPORT_DAY_OPTIONS.map((d) => (
        <option key={d} value={d}>
          {d === 1 ? '1 day' : `${d} days`}
        </option>
      ))}
    </select>
  );
}

interface LiveBodyProps {
  scope: OverviewScope;
  dayOffset: number;
}

function LiveBody({ scope, dayOffset }: LiveBodyProps) {
  const dayStart = dayStartWithOffset(dayOffset);
  const isToday = dayOffset === 0;
  const [debug, setDebug] = useState<OverviewDebug | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const end = isToday ? Date.now() : dayStartWithOffset(dayOffset - 1);
  useMountEffect(() =>
    startPolling(
      () => fetchOverviewDebug(dayStart, end, scope),
      isToday ? POLL_MS : null,
      {
        onValue: (result) => {
          setDebug((prev) =>
            prev && debugUnchanged(prev, result) ? prev : result,
          );
          setError((prev) => (prev === null ? prev : null));
          setLoading((prev) => (prev === false ? prev : false));
        },
        onError: (msg) => {
          setError(msg);
          setLoading((prev) => (prev === false ? prev : false));
        },
      },
    ),
  );

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>;
  if (error)
    return <div style={{ color: 'var(--accent-error-fg)' }}>{error}</div>;
  if (!debug) return null;

  return (
    <InspectorPanes
      samples={debug.samples}
      segments={debug.segments}
      aggregate={debug.aggregate}
    />
  );
}

function FixtureBody({ name }: { name: string }) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetchFixture(name).then(
      (rows) => {
        if (cancelled) return;
        setSamples(fixtureRowsToSamples(rows));
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  });

  const computed = useMemo(() => {
    if (!samples) return null;
    const segments = samplesToSegments(samples);
    return { samples, segments, aggregate: aggregate(segments) };
  }, [samples]);

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>;
  if (error)
    return <div style={{ color: 'var(--accent-error-fg)' }}>{error}</div>;
  if (!computed) return null;
  return (
    <InspectorPanes
      samples={computed.samples}
      segments={computed.segments}
      aggregate={computed.aggregate}
    />
  );
}

function FixtureSelect({
  fixtures,
  currentName,
  onLoad,
}: {
  fixtures: FixtureListEntry[];
  currentName: string | null;
  onLoad: (name: string) => void;
}) {
  if (fixtures.length === 0) {
    return (
      <span style={{ color: 'var(--text-disabled)' }}>No fixtures saved</span>
    );
  }
  return (
    <select
      value={currentName ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onLoad(v);
      }}
      style={{
        height: 24,
        padding: '0 6px',
        background: 'var(--bg-panel)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
      }}
    >
      <option value="" disabled>
        Load fixture…
      </option>
      {fixtures.map((f) => (
        <option key={f.name} value={f.name}>
          {f.name} ({f.samples})
        </option>
      ))}
    </select>
  );
}

function DayNav({
  dayOffset,
  dayStart,
  isToday,
  onChange,
}: {
  dayOffset: number;
  dayStart: number;
  isToday: boolean;
  onChange: (offset: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <NavBtn onClick={() => onChange(dayOffset + 1)} aria-label="Previous day">
        ‹
      </NavBtn>
      <span
        style={{
          minWidth: 110,
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        {formatDayTitle(dayOffset, dayStart)}
      </span>
      <NavBtn
        onClick={() => onChange(Math.max(0, dayOffset - 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        ›
      </NavBtn>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
} & React.AriaAttributes) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 24,
        height: 24,
        background: 'transparent',
        color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function BackToLiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '2px 10px',
        height: 24,
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      ‹ Live
    </button>
  );
}

function ExportButton({
  pending,
  onClick,
}: {
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        padding: '2px 10px',
        height: 24,
        background: 'transparent',
        color: pending ? 'var(--text-disabled)' : 'var(--text-secondary)',
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
        cursor: pending ? 'default' : 'pointer',
      }}
    >
      {pending ? 'Saving…' : 'Export'}
    </button>
  );
}

const SCOPE_OPTIONS: { value: OverviewScope; label: string }[] = [
  { value: 'this-device', label: 'This Device' },
  { value: 'all-devices', label: 'All Devices' },
];

function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: OverviewScope;
  onChange: (scope: OverviewScope) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        height: 24,
        border: '1px solid var(--border-mid)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {SCOPE_OPTIONS.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 10px',
            background:
              scope === opt.value ? 'var(--bg-selected)' : 'transparent',
            color:
              scope === opt.value
                ? 'var(--text-primary)'
                : 'var(--text-tertiary)',
            border: 'none',
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface InspectorPanesProps {
  samples: Sample[];
  segments: Segment[];
  aggregate: OverviewAggregate;
}

function InspectorPanes({ samples, segments, aggregate }: InspectorPanesProps) {
  const spanMs =
    segments.length > 0
      ? segments[segments.length - 1].endTs - segments[0].startTs
      : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <JsonPane title={`Samples (${samples.length})`} value={samples} />
      <JsonPane
        title={`Segments (${segments.length}, spanning ${formatDuration(spanMs)})`}
        value={segments}
      />
      <JsonPane title="Aggregate" value={aggregate} />
    </div>
  );
}

function JsonPane({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0);
  const json = useMemo(
    () => (isEmpty ? '' : JSON.stringify(value, null, 2)),
    [value, isEmpty],
  );

  async function copy() {
    if (!json) return;
    await navigator.clipboard.writeText(json);
  }

  return (
    <div
      style={{
        overflow: 'hidden',
        borderRadius: 4,
        border: '1px solid var(--border-soft)',
        background: 'var(--bg-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 12px',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            color: 'var(--text-primary)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'inline-block', width: 10 }}>
            {open ? '▾' : '▸'}
          </span>
          <span>{title}</span>
        </button>
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => {
            void copy();
          }}
          style={{
            padding: '2px 8px',
            background: 'transparent',
            color: isEmpty ? 'var(--text-disabled)' : 'var(--text-tertiary)',
            border: '1px solid var(--border-mid)',
            borderRadius: 4,
            cursor: isEmpty ? 'default' : 'pointer',
          }}
        >
          Copy
        </button>
      </div>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: 12,
            maxHeight: 360,
            overflow: 'auto',
            borderTop: '1px solid var(--border-soft)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {isEmpty ? 'Empty.' : json}
        </pre>
      )}
    </div>
  );
}
