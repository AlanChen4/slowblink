import type { CaptureStatus, Settings, SyncStatus } from '@shared/types';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export const NO_API_KEY_ISSUE = 'No API Key';

export function collectIssues(
  status: CaptureStatus,
  settings: Settings,
): string[] {
  const issues: string[] = [];
  if (!status.hasPermission) issues.push('No permission');
  if (settings.aiMode === 'byo-key' && !settings.hasApiKey) {
    issues.push(NO_API_KEY_ISSUE);
  }
  return issues;
}

function statusColor(
  status: CaptureStatus,
  paused: boolean,
  hasIssues: boolean,
): string {
  if (hasIssues || status.lastError) return 'bg-destructive';
  if (paused) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function statusLabel(status: CaptureStatus, paused: boolean): string {
  if (paused) return 'Paused';
  if (status.lastCaptureTs) {
    return `Last Updated at ${new Date(status.lastCaptureTs).toLocaleTimeString()}`;
  }
  return 'Running';
}

function syncLabel(sync: SyncStatus): string | null {
  if (!sync.enabled) return null;
  if (sync.state === 'offline') return 'Offline';
  if (sync.state === 'error') return 'Sync error';
  if (sync.pending > 0) return `Syncing ${sync.pending}`;
  return null;
}

export function StatusBadge({
  status,
  settings,
  sync,
  issues,
  onNavigateToApiKey,
}: {
  status: CaptureStatus | null;
  settings: Settings;
  sync: SyncStatus | null;
  issues: string[];
  onNavigateToApiKey?: () => void;
}) {
  if (!status) return null;
  const color = statusColor(status, settings.paused, issues.length > 0);
  const syncPart = sync ? syncLabel(sync) : null;
  const textColor =
    issues.length > 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground';
  return (
    <div className={cn('flex items-center gap-2', textColor)}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {issues.length > 0 ? (
        <IssueList issues={issues} onNavigateToApiKey={onNavigateToApiKey} />
      ) : (
        statusLabel(status, settings.paused)
      )}
      {syncPart && <span className="text-xs">· {syncPart}</span>}
    </div>
  );
}

function IssueList({
  issues,
  onNavigateToApiKey,
}: {
  issues: string[];
  onNavigateToApiKey?: () => void;
}) {
  return issues.map((issue, i) => {
    const separator = i > 0 ? ' • ' : '';
    const clickable = issue === NO_API_KEY_ISSUE && onNavigateToApiKey;
    return (
      <Fragment key={issue}>
        {separator}
        {clickable ? (
          <button
            type="button"
            onClick={onNavigateToApiKey}
            className="cursor-pointer underline-offset-2 hover:underline"
          >
            {issue}
          </button>
        ) : (
          issue
        )}
      </Fragment>
    );
  });
}
