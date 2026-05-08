import type { CaptureStatus, Settings, SyncStatus } from '@shared/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

const BASE_STATUS: CaptureStatus = {
  running: true,
  lastError: null,
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
  overviewScope: 'this-device',
};

// Regression guard: paused used to live on both `CaptureStatus` and `Settings`
// and arrive on two separate IPC channels, so the badge (reading status) and
// the pause button (reading settings) could briefly disagree mid-transition.
// Settings.paused is now the single source of truth; these tests pin that.
describe('StatusBadge pause-state source of truth', () => {
  test('shows "Paused" when settings.paused=true', () => {
    const freshSettings: Settings = { ...BASE_SETTINGS, paused: true };

    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={freshSettings}
        sync={null}
        issues={[]}
      />,
    );

    expect(screen.getByText('Paused')).toBeDefined();
  });

  test('shows live state when settings.paused=false', () => {
    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={BASE_SETTINGS}
        sync={null}
        issues={[]}
      />,
    );

    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.getByText('Running — 5s autocapture')).toBeDefined();
  });

  test('sync detail replaces the status label when present', () => {
    const pausedSettings: Settings = { ...BASE_SETTINGS, paused: true };
    const sync: SyncStatus = {
      enabled: true,
      state: 'error',
      lastFlushTs: null,
      pending: 0,
      synced: 0,
      failed: 1,
      lastError: 'boom',
    };

    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={pausedSettings}
        sync={sync}
        issues={[]}
      />,
    );

    expect(screen.getByText('Sync error')).toBeDefined();
    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
  });
});
