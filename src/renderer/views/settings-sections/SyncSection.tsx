import type { AuthSession, Settings } from '@shared/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export function SyncSection({
  settings,
  session,
}: {
  settings: Settings;
  session: AuthSession | null;
}) {
  async function toggle(enabled: boolean) {
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

  const isCloud = settings.storageMode === 'cloud-sync';
  const locked = !session;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className={locked ? 'text-muted-foreground text-sm' : 'text-sm'}>
          Sync to cloud
        </span>
        {locked && <Badge variant="secondary">Requires an account</Badge>}
      </div>
      <Switch
        checked={isCloud && !locked}
        onCheckedChange={toggle}
        disabled={locked}
        aria-label="Cloud sync"
      />
    </div>
  );
}
