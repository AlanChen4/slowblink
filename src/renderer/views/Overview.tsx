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
import { filterApps, formatDuration } from './overview-sections/format';
import { ScopeToggle } from './overview-sections/ScopeToggle';
import { TopApps, TopAppsSkeleton } from './overview-sections/TopApps';

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <OverviewBody
        key={`${settings.overviewScope}-${dayStart}`}
        scope={settings.overviewScope}
        dayStart={dayStart}
        isToday={isToday}
        dayOffset={dayOffset}
        onPrevDay={() => setDayOffset((n) => n + 1)}
        onNextDay={() => setDayOffset((n) => Math.max(0, n - 1))}
        settings={settings}
        plan={plan}
        onScopeChange={(next) => {
          void handleScopeChange(next);
        }}
      />
    </div>
  );
}

interface BodyProps {
  scope: OverviewScope;
  dayStart: number;
  isToday: boolean;
  dayOffset: number;
  onPrevDay: () => void;
  onNextDay: () => void;
  settings: Settings;
  plan: Plan | null;
  onScopeChange: (next: OverviewScope) => void;
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
    if (!cancel.value) handlers.setOverview(result);
  } catch (err) {
    if (!cancel.value)
      handlers.setLoadError(err instanceof Error ? err.message : String(err));
  } finally {
    if (!cancel.value) handlers.setLoading(false);
  }
}

async function refreshOverview(
  scope: OverviewScope,
  dayStart: number,
  dayEnd: number,
  cancel: { value: boolean },
  setOverview: (o: OverviewT) => void,
): Promise<void> {
  try {
    const result = await window.slowblink.getOverview(dayStart, dayEnd, scope);
    if (!cancel.value) setOverview(result);
  } catch (err) {
    if (!cancel.value) console.log('[overview] refresh failed:', err);
  }
}

function OverviewBody({
  scope,
  dayStart,
  isToday,
  dayOffset,
  onPrevDay,
  onNextDay,
  settings,
  plan,
  onScopeChange,
}: BodyProps) {
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
    const unsubscribe = window.slowblink.onSampleInserted((sample) => {
      if (cancel.value) return;
      if (!isToday || scope !== 'this-device') return;
      if (sample.ts < dayStart) return;
      void refreshOverview(scope, dayStart, Date.now(), cancel, setOverview);
    });
    return () => {
      cancel.value = true;
      unsubscribe();
    };
  });

  const filteredApps = overview ? filterApps(overview.aggregate.apps) : [];
  const totalDurationMs = filteredApps.reduce((s, a) => s + a.durationMs, 0);

  async function handleSwitchToThisDevice() {
    await window.slowblink.setSettings({ overviewScope: 'this-device' });
  }

  function renderBody() {
    if (loading) {
      return <TopAppsSkeleton />;
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
    return <TopApps apps={filteredApps} totalDurationMs={totalDurationMs} />;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrevDay}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="font-semibold text-xl">
            {formatDayTitle(dayOffset, dayStart)}
            {overview && (
              <span className="ml-3 text-muted-foreground">
                {formatDuration(totalDurationMs)}
              </span>
            )}
          </h1>
          {!isToday && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onNextDay}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
        <ScopeToggle
          scope={settings.overviewScope}
          settings={settings}
          plan={plan}
          onChange={onScopeChange}
        />
      </div>
      {renderBody()}
    </>
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
