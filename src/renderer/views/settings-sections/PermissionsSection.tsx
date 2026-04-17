import type { CaptureStatus } from '@shared/types';
import { toast } from 'sonner';
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
      <h3 className="font-medium text-sm">Permissions</h3>
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
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          {label}:{' '}
          <span className={granted ? 'text-green-600' : 'text-red-600'}>
            {granted ? 'granted' : 'not granted'}
          </span>
        </p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" disabled={granted} onClick={onRequest}>
          {granted ? 'Already granted' : requestLabel}
        </Button>
        <Button variant="outline" onClick={onOpenSettings}>
          Open Settings
        </Button>
      </div>
    </div>
  );
}
