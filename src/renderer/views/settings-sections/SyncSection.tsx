import type { AuthSession, Plan, Settings, SyncStatus } from '@shared/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

function formatState(s: SyncStatus): string {
  if (!s.enabled) return 'disabled';
  if (s.state === 'idle' && s.lastFlushTs)
    return `synced ${new Date(s.lastFlushTs).toLocaleTimeString()}`;
  return s.state;
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

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Cloud sync</h3>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm">
            {isCloud ? 'Syncing to your account' : 'Local only'}
          </p>
          <p className="text-muted-foreground text-xs">
            Retention: {retention}. Pending {counts.pending} · failed{' '}
            {counts.failed} · state: {formatState(counts)}
            {counts.lastError ? ` · ${counts.lastError}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => toggle(!isCloud)}>
            {isCloud ? 'Disable' : 'Enable'}
          </Button>
          {isCloud && (
            <>
              <Button
                variant="outline"
                onClick={() => window.slowblink.syncFlushNow()}
              >
                Sync now
              </Button>
              {counts.failed > 0 && (
                <Button
                  variant="outline"
                  onClick={() => window.slowblink.syncRetryFailed()}
                >
                  Retry failed
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
