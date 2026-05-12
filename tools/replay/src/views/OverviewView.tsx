import { useMemo, useState } from 'react';
import {
  dayStartWithOffset,
  fetchOverviewDebug,
  formatDuration,
  type OverviewDebug,
  type OverviewScope,
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

export function OverviewView() {
  const [scope, setScope] = useState<OverviewScope>('this-device');
  const [dayOffset, setDayOffset] = useState(0);
  return (
    <OverviewBody
      key={`${scope}-${dayOffset}`}
      scope={scope}
      dayOffset={dayOffset}
      onScopeChange={setScope}
      onDayOffsetChange={setDayOffset}
    />
  );
}

interface BodyProps {
  scope: OverviewScope;
  dayOffset: number;
  onScopeChange: (scope: OverviewScope) => void;
  onDayOffsetChange: (offset: number) => void;
}

function OverviewBody({
  scope,
  dayOffset,
  onScopeChange,
  onDayOffsetChange,
}: BodyProps) {
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
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-soft)',
          background: 'var(--bg-subtle)',
        }}
      >
        <DayNav
          dayOffset={dayOffset}
          dayStart={dayStart}
          isToday={isToday}
          onChange={onDayOffsetChange}
        />
        <ScopeSwitch scope={scope} onChange={onScopeChange} />
      </div>
      <div style={{ overflowY: 'auto', padding: '16px' }}>
        {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
        {!loading && error && (
          <div style={{ color: 'var(--accent-error-fg)' }}>{error}</div>
        )}
        {!loading && !error && debug && <InspectorPanes debug={debug} />}
      </div>
    </div>
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

function InspectorPanes({ debug }: { debug: OverviewDebug }) {
  const spanMs =
    debug.segments.length > 0
      ? debug.segments[debug.segments.length - 1].endTs -
        debug.segments[0].startTs
      : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <JsonPane
        title={`Samples (${debug.samples.length})`}
        value={debug.samples}
      />
      <JsonPane
        title={`Segments (${debug.segments.length}, spanning ${formatDuration(spanMs)})`}
        value={debug.segments}
      />
      <JsonPane title="Aggregate" value={debug.aggregate} />
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
