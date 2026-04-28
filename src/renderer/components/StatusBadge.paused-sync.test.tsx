import type { CaptureStatus, Settings } from '@shared/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

const BASE_STATUS: CaptureStatus = {
  running: true,
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
  overviewScope: 'this-device',
  overviewMinDurationMs: 5 * 60 * 1000,
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
    expect(screen.getByText('Running')).toBeDefined();
  });
});
