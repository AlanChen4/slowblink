import type { CaptureStatus as CaptureStatusType } from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMountEffect } from '@/hooks/use-mount-effect';

function statusLabel(status: CaptureStatusType): {
  label: string;
  tone: 'ok' | 'paused' | 'error';
} {
  if (status.autoPaused) return { label: 'Auto-paused', tone: 'error' };
  if (status.running) return { label: 'Running', tone: 'ok' };
  return { label: 'Stopped', tone: 'paused' };
}

const TONE_CLASS = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  paused: 'text-muted-foreground',
  error: 'text-red-600 dark:text-red-400',
} as const;

export function CaptureStatus() {
  const [status, setStatus] = useState<CaptureStatusType | null>(null);
  const [resuming, setResuming] = useState(false);

  useMountEffect(() => {
    const unsubscribe = window.slowblink.onStatus(setStatus);
    void window.slowblink.getStatus().then(setStatus);
    return unsubscribe;
  });

  async function resume() {
    setResuming(true);
    try {
      await window.slowblink.resume();
      toast.success('Capture resumed');
    } catch (err) {
      toast.error('Failed to resume', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">Capture status</p>
      {status ? (
        <CaptureStatusBody
          status={status}
          resuming={resuming}
          onResume={resume}
        />
      ) : (
        <CaptureStatusSkeleton />
      )}
    </div>
  );
}

function CaptureStatusBody({
  status,
  resuming,
  onResume,
}: {
  status: CaptureStatusType;
  resuming: boolean;
  onResume: () => void;
}) {
  const { label, tone } = statusLabel(status);
  return (
    <div className="space-y-2 rounded-md border border-muted-foreground/40 border-dashed p-3 text-xs">
      <Row label="State" value={label} valueClass={TONE_CLASS[tone]} />
      {status.autoPaused && (
        <Row
          label="Auto-paused reason"
          value={status.autoPaused}
          valueClass="font-mono break-all"
        />
      )}
      {status.lastError && status.lastError !== status.autoPaused && (
        <Row
          label="Last error"
          value={status.lastError}
          valueClass="font-mono break-all"
        />
      )}
      {status.autoPaused && (
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={onResume} disabled={resuming}>
            {resuming ? 'Resuming…' : 'Resume captures'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 flex-1 ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

function CaptureStatusSkeleton() {
  return (
    <div className="space-y-2 rounded-md border border-muted-foreground/40 border-dashed p-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-start gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
