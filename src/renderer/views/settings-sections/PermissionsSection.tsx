import type { CaptureStatus } from '@shared/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function PermissionsSection({
  status,
}: {
  status: CaptureStatus | null;
}) {
  async function requestScreen() {
    const granted = await window.slowblink.requestPermission();
    if (!granted) {
      toast.error('Screen recording not granted', {
        description:
          'System Settings has been opened — enable slowblink (or Electron in dev) under Privacy & Security → Screen Recording, then quit and relaunch the app.',
      });
    }
  }

  return (
    <div className="space-y-4">
      <PermissionRow
        label="Screen recording"
        granted={status?.hasPermission}
        requestLabel="Request screen recording"
        onRequest={requestScreen}
        onOpenSettings={() => window.slowblink.openPermissionSettings()}
      />
      <PermissionRow
        label="Accessibility"
        granted={status?.hasAccessibility}
        hint="Enables reading the focused window title and open windows across apps for richer context."
        requestLabel="Request accessibility"
        onRequest={() => window.slowblink.requestAccessibilityPermission()}
        onOpenSettings={() =>
          window.slowblink.openAccessibilityPermissionSettings()
        }
      />
    </div>
  );
}

export function PermissionRow({
  label,
  granted,
  hint,
  requestLabel,
  onRequest,
  onOpenSettings,
}: {
  label: string;
  granted: boolean | undefined;
  hint?: string;
  requestLabel: string;
  onRequest: () => unknown;
  onOpenSettings: () => unknown;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span>{label}</span>
          <Badge variant={granted ? 'default' : 'destructive'}>
            {granted ? 'Granted' : 'Not granted'}
          </Badge>
        </div>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!granted && (
          <Button variant="secondary" onClick={onRequest}>
            {requestLabel}
          </Button>
        )}
        <Button variant="secondary" onClick={onOpenSettings}>
          Open Settings
        </Button>
      </div>
    </div>
  );
}
