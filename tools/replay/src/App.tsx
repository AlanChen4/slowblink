import { useState } from 'react';
import {
  type CaptureStatus,
  clearAll,
  type FilterValue,
  fetchStatus,
  startPolling,
  triggerCapture,
  useMountEffect,
} from './api';
import { CaptureStatusPill } from './components/CaptureStatusPill';
import { CapturesView } from './views/CapturesView';
import { LogsView } from './views/LogsView';
import { OverviewView } from './views/OverviewView';

type PrimaryTab = 'captures' | 'logs' | 'overview';

const PRIMARY_TABS: { value: PrimaryTab; label: string }[] = [
  { value: 'captures', label: 'Captures' },
  { value: 'logs', label: 'Logs' },
  { value: 'overview', label: 'Overview' },
];

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'dlp_blocked', label: 'Blocked' },
  { value: 'error', label: 'Error' },
];

const STATUS_POLL_MS = 2000;

function statusEqual(
  a: CaptureStatus | null,
  b: CaptureStatus | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.running === b.running &&
    a.lastError === b.lastError &&
    a.autoPaused === b.autoPaused &&
    a.hasPermission === b.hasPermission &&
    a.hasAccessibility === b.hasAccessibility &&
    a.hasApiKey === b.hasApiKey
  );
}

export function App() {
  const [primary, setPrimary] = useState<PrimaryTab>('captures');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [clearNonce, setClearNonce] = useState(0);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useMountEffect(() =>
    startPolling(fetchStatus, STATUS_POLL_MS, {
      onValue: (s) => {
        setStatus((prev) => (statusEqual(prev, s) ? prev : s));
        setConnected((prev) => (prev === true ? prev : true));
      },
      onError: () => {
        setStatus((prev) => (prev === null ? prev : null));
        setConnected((prev) => (prev === false ? prev : false));
      },
    }),
  );

  async function onCaptureNow() {
    if (capturePending) return;
    setCapturePending(true);
    setCaptureError(null);
    try {
      await triggerCapture();
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : String(err));
    } finally {
      setCapturePending(false);
    }
  }

  async function onClear() {
    if (!confirm('Delete all captured rows and JPEGs? This cannot be undone.'))
      return;
    try {
      const result = await clearAll();
      alert(`Cleared ${result.rows} row(s) and ${result.files} file(s).`);
      setClearNonce((n) => n + 1);
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
      <Header
        primary={primary}
        onPrimaryChange={setPrimary}
        filter={filter}
        onFilterChange={setFilter}
        status={status}
        connected={connected}
        capturePending={capturePending}
        captureError={captureError}
        onCaptureNow={() => {
          void onCaptureNow();
        }}
        onClear={() => {
          void onClear();
        }}
      />
      <main style={{ minHeight: 0 }}>
        <RoutedView primary={primary} filter={filter} clearNonce={clearNonce} />
      </main>
    </div>
  );
}

interface HeaderProps {
  primary: PrimaryTab;
  onPrimaryChange: (next: PrimaryTab) => void;
  filter: FilterValue;
  onFilterChange: (next: FilterValue) => void;
  status: CaptureStatus | null;
  connected: boolean | null;
  capturePending: boolean;
  captureError: string | null;
  onCaptureNow: () => void;
  onClear: () => void;
}

function Header({
  primary,
  onPrimaryChange,
  filter,
  onFilterChange,
  status,
  connected,
  capturePending,
  captureError,
  onCaptureNow,
  onClear,
}: HeaderProps) {
  const onCaptures = primary === 'captures';
  const showActions = connected !== false;
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg-elevated)',
      }}
    >
      <TabStrip
        items={PRIMARY_TABS}
        value={primary}
        onChange={onPrimaryChange}
      />
      {onCaptures && <VerticalDivider />}
      {onCaptures && (
        <TabStrip items={FILTERS} value={filter} onChange={onFilterChange} />
      )}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {captureError && (
          <span style={{ color: 'var(--accent-error-fg)' }}>
            {captureError}
          </span>
        )}
        {showActions && onCaptures && (
          <>
            <CaptureNowButton pending={capturePending} onClick={onCaptureNow} />
            <ClearAllButton onClick={onClear} />
          </>
        )}
        <CaptureStatusPill status={status} connected={connected} />
      </div>
    </header>
  );
}

function RoutedView({
  primary,
  filter,
  clearNonce,
}: {
  primary: PrimaryTab;
  filter: FilterValue;
  clearNonce: number;
}) {
  if (primary === 'captures') {
    return <CapturesView key={`${filter}-${clearNonce}`} filter={filter} />;
  }
  if (primary === 'logs') return <LogsView />;
  return <OverviewView />;
}

function CaptureNowButton({
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
        padding: '4px 12px',
        background: pending ? 'var(--capture-bg-pending)' : 'var(--capture-bg)',
        color: pending ? 'var(--capture-fg-pending)' : 'var(--capture-fg)',
        border: '1px solid var(--capture-border)',
        borderRadius: 4,
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Capturing…' : 'Capture'}
    </button>
  );
}

function ClearAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        background: 'var(--clear-bg)',
        color: 'var(--clear-fg)',
        border: '1px solid var(--clear-border)',
        borderRadius: 4,
      }}
    >
      Clear
    </button>
  );
}

function TabStrip<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {items.map((t) => {
        const active = value === t.value;
        return (
          <button
            type="button"
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              padding: '4px 12px',
              background: active ? 'var(--bg-tab-active)' : 'transparent',
              color: active ? 'var(--text-strong)' : 'var(--text-label)',
              border: '1px solid var(--border-strong)',
              borderRadius: 4,
              fontWeight: active ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function VerticalDivider() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 1,
        height: 20,
        background: 'var(--border-mid)',
      }}
    />
  );
}
