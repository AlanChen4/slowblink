import type {
  AuthSession,
  OverviewScope,
  Overview as OverviewT,
  Plan,
  Settings,
} from '@shared/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { startOfDay } from '@/lib/categories';
import { MinDurationControl } from './overview-sections/MinDurationControl';
import { ScopeToggle } from './overview-sections/ScopeToggle';
import { TopApps } from './overview-sections/TopApps';

interface Props {
  settings: Settings;
  session?: AuthSession | null;
  plan?: Plan | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatDayTitle(offset: number, dayStart: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function Overview({ settings, plan = null }: Props) {
  // Snapshot today at mount so fetches stay aligned to a stable anchor; the
  // user can navigate days regardless of clock drift across midnight.
  const [todayAnchor] = useState(() => startOfDay());
  const [dayOffset, setDayOffset] = useState(0);
  const dayStart = todayAnchor - dayOffset * ONE_DAY_MS;
  const isToday = dayOffset === 0;

  async function handleScopeChange(next: OverviewScope) {
    if (next !== settings.overviewScope) {
      await window.slowblink.setSettings({ overviewScope: next });
    }
  }

  async function handleMinDurationChange(next: number) {
    if (next !== settings.overviewMinDurationMs) {
      await window.slowblink.setSettings({ overviewMinDurationMs: next });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDayOffset((n) => n + 1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="min-w-[8rem] text-center font-semibold text-xl">
            {formatDayTitle(dayOffset, dayStart)}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDayOffset((n) => Math.max(0, n - 1))}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <MinDurationControl
            value={settings.overviewMinDurationMs}
            onChange={(next) => {
              void handleMinDurationChange(next);
            }}
          />
          <ScopeToggle
            scope={settings.overviewScope}
            settings={settings}
            plan={plan}
            onChange={(next) => {
              void handleScopeChange(next);
            }}
          />
        </div>
      </div>
      <OverviewForScope
        key={`${settings.overviewScope}-${dayStart}`}
        scope={settings.overviewScope}
        dayStart={dayStart}
        isToday={isToday}
        minDurationMs={settings.overviewMinDurationMs}
      />
    </div>
  );
}

interface ScopedProps {
  scope: OverviewScope;
  dayStart: number;
  isToday: boolean;
  minDurationMs: number;
}

interface LoadHandlers {
  setOverview: (o: OverviewT) => void;
  setLoadError: (e: string) => void;
  setLoading: (v: boolean) => void;
}

async function loadOverview(
  scope: OverviewScope,
  dayStart: number,
  dayEnd: number,
  cancel: { value: boolean },
  handlers: LoadHandlers,
): Promise<void> {
  try {
    const result = await window.slowblink.getOverview(dayStart, dayEnd, scope);
    if (cancel.value) return;
    handlers.setOverview(result);
  } catch (err) {
    if (cancel.value) return;
    handlers.setLoadError(err instanceof Error ? err.message : String(err));
  } finally {
    if (!cancel.value) handlers.setLoading(false);
  }
}

function OverviewForScope({
  scope,
  dayStart,
  isToday,
  minDurationMs,
}: ScopedProps) {
  const [overview, setOverview] = useState<OverviewT | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // For today, end = "now" so segments only cover what's actually happened.
  // For past days, end = end-of-day so we capture the full day's samples.
  const dayEnd = () => (isToday ? Date.now() : dayStart + ONE_DAY_MS);

  useMountEffect(() => {
    const cancel = { value: false };
    void loadOverview(scope, dayStart, dayEnd(), cancel, {
      setOverview,
      setLoadError,
      setLoading,
    });
    return () => {
      cancel.value = true;
    };
  });

  async function handleSwitchToThisDevice() {
    await window.slowblink.setSettings({ overviewScope: 'this-device' });
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading overview…</p>;
  }
  if (loadError) {
    return (
      <OverviewErrorState
        scope={scope}
        error={loadError}
        onSwitchToThisDevice={() => {
          void handleSwitchToThisDevice();
        }}
      />
    );
  }
  if (!overview) return null;

  return (
    <TopApps aggregate={overview.aggregate} minDurationMs={minDurationMs} />
  );
}

interface ErrorStateProps {
  scope: OverviewScope;
  error: string;
  onSwitchToThisDevice: () => void;
}

function OverviewErrorState({
  scope,
  error,
  onSwitchToThisDevice,
}: ErrorStateProps) {
  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium">Couldn't load overview.</p>
      <p className="text-muted-foreground">{error}</p>
      {scope === 'all-devices' && (
        <button
          type="button"
          onClick={onSwitchToThisDevice}
          className="font-medium text-primary text-xs hover:underline"
        >
          Switch to This device
        </button>
      )}
    </div>
  );
}
