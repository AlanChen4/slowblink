import type { Settings } from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { OverviewInspector } from './dev-sections/OverviewInspector';

export function Dev() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useMountEffect(() => {
    void window.slowblink.getSettings().then(setSettings);
    return window.slowblink.onSettings(setSettings);
  });
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">Trigger a capture</p>
        <DevCaptureButton />
      </div>
      {settings && <OverviewInspector settings={settings} />}
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
