import type { Settings } from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { OverviewInspector } from './dev-sections/OverviewInspector';
import { ProcessLogs } from './dev-sections/ProcessLogs';

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
      {import.meta.env.DEV && <ReplayLoggingToggle />}
      <ProcessLogs />
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

function ReplayLoggingToggle() {
  const [enabled, setEnabled] = useState(false);
  useMountEffect(() => {
    void window.slowblink.getReplayLogging().then(setEnabled);
  });
  async function toggle(next: boolean) {
    setEnabled(next);
    try {
      const applied = await window.slowblink.setReplayLogging(next);
      setEnabled(applied);
      toast.success(applied ? 'Replay logging on' : 'Replay logging off');
    } catch (err) {
      setEnabled(!next);
      toast.error('Failed to update replay logging', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-muted-foreground/40 border-dashed p-3">
      <div className="space-y-1">
        <p className="font-medium text-sm">Replay logging</p>
        <p className="text-muted-foreground text-xs">
          Persist each capture (screenshot + request + response) to{' '}
          <code className="text-[11px]">dev_captures</code>. Inspect via{' '}
          <code className="text-[11px]">pnpm replay</code> at{' '}
          <code className="text-[11px]">localhost:5174</code>. Dev only — never
          writes in packaged builds.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} />
    </div>
  );
}
