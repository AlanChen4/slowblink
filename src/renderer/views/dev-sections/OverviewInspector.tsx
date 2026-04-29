import type { OverviewDebug, OverviewScope, Settings } from '@shared/types';
import { ChevronLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { startOfDay } from '@/lib/categories';
import { formatDuration } from '../overview-sections/format';

interface Props {
  settings: Settings;
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

export function OverviewInspector({ settings }: Props) {
  const [scope, setScope] = useState<OverviewScope>(settings.overviewScope);
  const [todayAnchor] = useState(() => startOfDay());
  const [dayOffset, setDayOffset] = useState(0);
  const dayStart = todayAnchor - dayOffset * ONE_DAY_MS;
  const isToday = dayOffset === 0;
  const [debug, setDebug] = useState<OverviewDebug | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(
    nextScope: OverviewScope = scope,
    nextOffset: number = dayOffset,
  ) {
    setLoading(true);
    setError(null);
    const start = todayAnchor - nextOffset * ONE_DAY_MS;
    const end = nextOffset === 0 ? Date.now() : start + ONE_DAY_MS;
    try {
      const result = await window.slowblink.getOverviewDebug(
        start,
        end,
        nextScope,
      );
      setDebug(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    const end = isToday ? Date.now() : dayStart + ONE_DAY_MS;
    try {
      const result = await window.slowblink.refreshOverviewDebug(
        dayStart,
        end,
        scope,
      );
      setDebug(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useMountEffect(() => {
    void load(scope, dayOffset);
  });

  function handleScopeChange(next: OverviewScope) {
    setScope(next);
    void load(next, dayOffset);
  }

  function handleDayChange(nextOffset: number) {
    setDayOffset(nextOffset);
    void load(scope, nextOffset);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm">Overview pipeline</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleDayChange(dayOffset + 1)}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-[6rem] text-center text-xs">
              {formatDayTitle(dayOffset, dayStart)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleDayChange(Math.max(0, dayOffset - 1))}
              disabled={isToday}
              aria-label="Next day"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <ScopeSwitch scope={scope} onChange={handleScopeChange} />
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              void refresh();
            }}
          >
            <RefreshCw
              className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'}
            />
            Refresh
          </Button>
        </div>
      </div>
      {loading && (
        <p className="text-muted-foreground text-xs">Loading debug payload…</p>
      )}
      {!loading && error && <p className="text-destructive text-xs">{error}</p>}
      {!loading && !error && debug && <InspectorPanes debug={debug} />}
    </div>
  );
}

function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: OverviewScope;
  onChange: (scope: OverviewScope) => void;
}) {
  const options: OverviewScope[] = ['this-device', 'all-devices'];
  return (
    <div className="inline-flex rounded-md border border-input bg-background p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={
            scope === opt
              ? 'rounded-sm bg-secondary px-2.5 py-1 font-medium text-secondary-foreground text-xs'
              : 'rounded-sm px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground'
          }
        >
          {opt}
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span>
          range <code className="text-foreground">{debug.range.rangeKey}</code>
        </span>
        <span>
          tz <code className="text-foreground">{debug.range.timezone}</code>
        </span>
      </div>
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

interface JsonPaneProps {
  title: string;
  value: unknown;
  emptyHint?: string;
}

function JsonPane({ title, value, emptyHint }: JsonPaneProps) {
  const [open, setOpen] = useState(false);
  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0);
  const json = isEmpty ? '' : JSON.stringify(value, null, 2);
  async function copy() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      toast.success('Copied');
    } catch (err) {
      toast.error('Copy failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm hover:underline"
        >
          <ChevronRight
            className={
              open
                ? 'size-3.5 rotate-90 transition-transform'
                : 'size-3.5 transition-transform'
            }
          />
          <span>{title}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isEmpty}
          onClick={() => {
            void copy();
          }}
        >
          <Copy className="size-3.5" />
          Copy
        </Button>
      </div>
      {open && (
        <pre className="max-h-96 overflow-auto border-border border-t bg-secondary/40 p-3 text-secondary-foreground text-xs">
          {isEmpty ? (emptyHint ?? 'Empty.') : json}
        </pre>
      )}
    </div>
  );
}
