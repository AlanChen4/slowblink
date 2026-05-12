import type { CaptureStatus } from '../api';

interface Props {
  status: CaptureStatus | null;
  connected: boolean | null;
}

const TONE = {
  ok: 'var(--accent-success-fg)',
  paused: 'var(--accent-neutral-fg)',
  error: 'var(--accent-error-fg)',
  neutral: 'var(--accent-neutral-fg)',
} as const;

type Tone = keyof typeof TONE;

interface Display {
  label: string;
  tone: Tone;
  detail: string | null;
}

function display(
  status: CaptureStatus | null,
  connected: boolean | null,
): Display {
  if (status) {
    if (status.autoPaused) {
      return { label: 'Auto-paused', tone: 'error', detail: status.autoPaused };
    }
    if (status.running) return { label: 'Running', tone: 'ok', detail: null };
    return { label: 'Stopped', tone: 'paused', detail: status.lastError };
  }
  if (connected === false) {
    return {
      label: 'Disconnected',
      tone: 'error',
      detail: 'Electron app not running.',
    };
  }
  return { label: 'Connecting…', tone: 'neutral', detail: null };
}

export function CaptureStatusPill({ status, connected }: Props) {
  const { label, tone, detail } = display(status, connected);
  const color = TONE[tone];
  return (
    <span
      title={detail ?? undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 240,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
        {detail && status ? ` · ${detail}` : ''}
      </span>
    </span>
  );
}
