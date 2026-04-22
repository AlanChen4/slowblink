import type { AuthSession, Plan, Settings, SyncStatus } from '@shared/types';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMountEffect } from '@/hooks/use-mount-effect';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function DataSection({
  session,
  settings,
  sync,
  plan,
}: {
  session: AuthSession | null;
  settings: Settings;
  sync: SyncStatus | null;
  plan: Plan;
}) {
  const [storageBytes, setStorageBytes] = useState<number | null>(null);

  useMountEffect(() => {
    void window.slowblink.getLocalStorageSize().then(setStorageBytes);
  });

  async function deleteAll() {
    const msg = session
      ? 'Delete all recorded samples, both on this Mac AND in your account? This cannot be undone.'
      : 'Delete all recorded samples on this Mac? This cannot be undone.';
    if (!confirm(msg)) return;
    await window.slowblink.deleteAllData();
    void window.slowblink.getLocalStorageSize().then(setStorageBytes);
  }

  const isCloud = settings.storageMode === 'cloud-sync';
  const retention = plan.tier === 'paid' ? 'Unlimited' : '7 days';
  const canUpgradeRetention = plan.tier !== 'paid';
  const pending = sync?.pending ?? 0;
  const synced = sync?.synced ?? 0;
  const failed = sync?.failed ?? 0;
  const lastError = sync?.lastError ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm">Delete all data</p>
          <p className="text-muted-foreground text-xs">
            Permanently remove all recorded data
            {storageBytes !== null && ` — ${formatBytes(storageBytes)}`}.
          </p>
        </div>
        <Button variant="destructive" onClick={deleteAll}>
          Delete all data
        </Button>
      </div>
      {isCloud && (
        <div className="space-y-4">
          <Row
            label="Cloud retention"
            value={retention}
            badge={
              canUpgradeRetention ? (
                <Badge variant="secondary">Upgrade for unlimited</Badge>
              ) : null
            }
          />
          <Row label="Successful uploads" value={String(synced)} />
          <Row label="Pending uploads" value={String(pending)} />
          <Row
            label="Failed uploads"
            value={String(failed)}
            action={
              failed > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.slowblink.syncRetryFailed()}
                >
                  Retry failed
                </Button>
              ) : null
            }
          />
          {lastError && (
            <p className="text-destructive text-xs">Last error: {lastError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  action,
  badge,
}: {
  label: string;
  value: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}</span>
        {badge}
      </div>
      <div className="flex items-center gap-3">
        <span>{value}</span>
        {action}
      </div>
    </div>
  );
}
