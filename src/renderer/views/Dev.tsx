import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function Dev() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">Dev tools</h3>
        <p className="text-muted-foreground text-xs">
          Utilities for local development. This view is only visible when
          running `pnpm dev`.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">Trigger a capture immediately.</p>
        <DevCaptureButton />
      </div>
    </div>
  );
}

function DevCaptureButton() {
  async function trigger() {
    try {
      await window.slowblink.captureOnce();
      toast.success('Capture complete');
    } catch (err) {
      toast.error('Capture failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <Button variant="secondary" onClick={trigger}>
      Capture once
    </Button>
  );
}
