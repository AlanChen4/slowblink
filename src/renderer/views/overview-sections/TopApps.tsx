import type { AppDuration } from '@shared/types';
import { Activity } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDuration } from './format';

interface Props {
  apps: AppDuration[];
  totalDurationMs: number;
}

export function TopApps({ apps, totalDurationMs }: Props) {
  if (apps.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Activity />
          </EmptyMedia>
          <EmptyTitle>No app activity yet</EmptyTitle>
          <EmptyDescription>
            Once slowblink captures a sample, your top apps will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="space-y-3">
      {apps.map((a) => (
        <li key={a.app} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {a.iconDataUrl ? (
                <img
                  src={a.iconDataUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-md"
                />
              ) : (
                <div className="size-10 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate font-medium text-base">{a.app}</span>
            </div>
            <span className="shrink-0 text-base tabular-nums">
              {formatDuration(a.durationMs)}
            </span>
          </div>
          <div className="pl-[3.25rem]">
            <DurationBar
              pct={totalDurationMs > 0 ? a.durationMs / totalDurationMs : 0}
              className="h-1.5"
            />
          </div>
          {a.windows.length > 0 && (
            <ul className="space-y-1.5 pl-[3.25rem]">
              {a.windows.map((w) => (
                <li key={w.window} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium text-base text-muted-foreground">
                      {w.window}
                    </span>
                    <span className="shrink-0 text-base text-muted-foreground tabular-nums">
                      {formatDuration(w.durationMs)}
                    </span>
                  </div>
                  <DurationBar
                    pct={
                      totalDurationMs > 0 ? w.durationMs / totalDurationMs : 0
                    }
                    className="h-1.5"
                  />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

const SKELETON_ROW_WIDTHS = ['w-32', 'w-48', 'w-40', 'w-28', 'w-44'] as const;
const SKELETON_BAR_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/5'];

export function TopAppsSkeleton() {
  return (
    <ul className="space-y-3">
      {SKELETON_ROW_WIDTHS.map((labelWidth, i) => (
        <li key={labelWidth} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <Skeleton className={cn('h-5', labelWidth)} />
            </div>
            <Skeleton className="h-5 w-12 shrink-0" />
          </div>
          <div className="pl-[3.25rem]">
            <Skeleton
              className={cn('h-1.5 rounded-full', SKELETON_BAR_WIDTHS[i])}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DurationBar({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
