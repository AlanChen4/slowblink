import type { CaptureStatus, Settings } from '@shared/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

const BASE_STATUS: CaptureStatus = {
  running: true,
  paused: false,
  lastError: null,
  lastCaptureTs: null,
  hasPermission: true,
  hasAccessibility: true,
  hasApiKey: true,
};

const BASE_SETTINGS: Settings = {
  intervalMs: 5000,
  model: 'gpt-5.4-nano',
  paused: false,
  hasApiKey: true,
  apiKeySource: 'saved',
  apiKeyHint: 'sk-xxx',
  storageMode: 'local',
  aiMode: 'byo-key',
  onboardingComplete: true,
};

// The bug: `status.paused` and `settings.paused` travel to the renderer on two
// separate IPC channels (`statusUpdate`, `settingsUpdate`). The PauseButton
// reads `settings.paused`, the StatusBadge reads `status.paused`. During a
// pause/resume transition the two channels can arrive out of sync, and the
// renderer shows an inconsistent state — e.g. badge says "Running" while the
// button offers Resume.
//
// Invariant: there is one source of truth for paused. `Settings.paused` is the
// persisted user intent and should drive both UI surfaces.
describe('StatusBadge pause-state source of truth', () => {
  test('shows "Paused" when settings.paused=true, even while status.paused is stale', () => {
    const staleStatus: CaptureStatus = { ...BASE_STATUS, paused: false };
    const freshSettings: Settings = { ...BASE_SETTINGS, paused: true };

    render(
      <StatusBadge
        status={staleStatus}
        settings={freshSettings}
        sync={null}
        issues={[]}
      />,
    );

    expect(screen.getByText('Paused')).toBeDefined();
  });

  test('shows live state when settings.paused=false, even while status.paused is stale', () => {
    const staleStatus: CaptureStatus = { ...BASE_STATUS, paused: true };
    const freshSettings: Settings = { ...BASE_SETTINGS, paused: false };

    render(
      <StatusBadge
        status={staleStatus}
        settings={freshSettings}
        sync={null}
        issues={[]}
      />,
    );

    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.getByText('Running')).toBeDefined();
  });
});
