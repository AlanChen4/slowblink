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
import { dayStartWithOffset } from '@/lib/categories';
import {
  filterApps,
  formatDuration,
  MIN_DURATION_MS,
} from './overview-sections/format';
import { ScopeToggle } from './overview-sections/ScopeToggle';
import { TopApps, TopAppsSkeleton } from './overview-sections/TopApps';

interface Props {
  settings: Settings;
  session?: AuthSession | null;
  plan?: Plan | null;
}

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
  const [dayOffset, setDayOffset] = useState(0);
  const dayStart = dayStartWithOffset(dayOffset);
  const isToday = dayOffset === 0;

  async function handleScopeChange(next: OverviewScope) {
    if (next !== settings.overviewScope) {
      await window.slowblink.setSettings({ overviewScope: next });
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
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
  setLoading?: (v: boolean) => void;
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
    if (!cancel.value) {
      handlers.setLoadError(err instanceof Error ? err.message : String(err));
    }
  } finally {
    if (!cancel.value) handlers.setLoading?.(false);
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

  useMountEffect(() => {
    const cancel = { value: false };
    const dayEnd = isToday ? Date.now() : dayStartWithOffset(dayOffset - 1);
    void loadOverview(scope, dayStart, dayEnd, cancel, {
      setOverview,
      setLoadError,
      setLoading,
    });
    if (!isToday || scope !== 'this-device') {
      return () => {
        cancel.value = true;
      };
    }
    const unsubscribe = window.slowblink.onSampleInserted((sample) => {
      if (sample.ts < dayStart) return;
      void loadOverview(scope, dayStart, Date.now(), cancel, {
        setOverview,
        setLoadError,
      });
    });
    return () => {
      cancel.value = true;
      unsubscribe();
    };
  });

  const filteredApps = overview ? filterApps(overview.aggregate.apps) : [];
  const totalDurationMs = filteredApps.reduce(
    (s, a) => s + Math.floor(a.durationMs / MIN_DURATION_MS) * MIN_DURATION_MS,
    0,
  );

  async function handleSwitchToThisDevice() {
    await window.slowblink.setSettings({ overviewScope: 'this-device' });
  }

  function renderBody() {
    if (loading) {
      return (
        <div className="animate-in duration-150 fade-in-0 [animation-delay:200ms] [animation-fill-mode:both]">
          <TopAppsSkeleton />
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="animate-in duration-150 fade-in-0">
          <OverviewErrorState
            scope={scope}
            error={loadError}
            onSwitchToThisDevice={() => {
              void handleSwitchToThisDevice();
            }}
          />
        </div>
      );
    }
    if (!overview) return null;
    return (
      <div className="animate-in duration-150 fade-in-0">
        <TopApps apps={filteredApps} totalDurationMs={totalDurationMs} />
      </div>
    );
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
          <h1 className="text-xl font-semibold">
            {formatDayTitle(dayOffset, dayStart)}
            {overview && (
              <span className="ml-3 animate-in text-muted-foreground duration-150 fade-in-0">
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
          className="text-xs font-medium text-primary hover:underline"
        >
          Switch to This device
        </button>
      )}
    </div>
  );
}
