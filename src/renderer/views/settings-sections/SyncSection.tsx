import type { AuthSession, Plan, Settings, SyncStatus } from '@shared/types';
import { toast } from 'sonner';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

function stateBadge(s: SyncStatus): { label: string; variant: BadgeVariant } {
  if (!s.enabled) return { label: 'Disabled', variant: 'secondary' };
  if (s.state === 'error') return { label: 'Error', variant: 'destructive' };
  if (s.state === 'offline') return { label: 'Offline', variant: 'secondary' };
  if (s.state === 'idle' && s.lastFlushTs) {
    return {
      label: `Synced ${new Date(s.lastFlushTs).toLocaleTimeString()}`,
      variant: 'default',
    };
  }
  return { label: s.state, variant: 'secondary' };
}

export function SyncSection({
  settings,
  sync,
  session,
  plan,
}: {
  settings: Settings;
  sync: SyncStatus | null;
  session: AuthSession | null;
  plan: Plan;
}) {
  async function toggle(enabled: boolean) {
    if (enabled && !session) {
      toast.error('Sign in to enable cloud sync');
      return;
    }
    try {
      await window.slowblink.setSettings({
        storageMode: enabled ? 'cloud-sync' : 'local',
      });
    } catch (err) {
      toast.error('Could not change sync mode', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const retention = plan.tier === 'paid' ? 'unlimited' : '7 days';
  const counts: SyncStatus = sync ?? {
    pending: 0,
    failed: 0,
    synced: 0,
    state: 'disabled',
    enabled: false,
    lastFlushTs: null,
    lastError: null,
  };
  const isCloud = settings.storageMode === 'cloud-sync';
  const badge = stateBadge(counts);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span>{isCloud ? 'Syncing to your account' : 'Local only'}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Retention: {retention}. Pending {counts.pending} · failed{' '}
            {counts.failed}
            {counts.lastError ? ` · ${counts.lastError}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {isCloud && (
            <>
              <Button
                variant="secondary"
                onClick={() => window.slowblink.syncFlushNow()}
              >
                Sync now
              </Button>
              {counts.failed > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => window.slowblink.syncRetryFailed()}
                >
                  Retry failed
                </Button>
              )}
            </>
          )}
          <Switch
            checked={isCloud}
            onCheckedChange={toggle}
            aria-label="Cloud sync"
          />
        </div>
      </div>
    </div>
  );
}
