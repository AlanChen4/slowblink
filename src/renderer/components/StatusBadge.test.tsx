import type { CaptureStatus, Settings } from '@shared/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { collectIssues, StatusBadge } from './StatusBadge';

afterEach(cleanup);

const BASE_STATUS: CaptureStatus = {
  running: true,
  lastError: null,
  lastCaptureTs: null,
  hasPermission: true,
  hasAccessibility: true,
  hasApiKey: false,
};

const BASE_SETTINGS: Settings = {
  intervalMs: 5000,
  model: 'gpt-5.4-nano',
  paused: false,
  hasApiKey: false,
  apiKeySource: null,
  apiKeyHint: null,
  storageMode: 'local',
  aiMode: 'byo-key',
  onboardingComplete: true,
  overviewScope: 'this-device',
  overviewMinDurationMs: 5 * 60 * 1000,
};

describe('collectIssues', () => {
  test('reports "No API Key" when BYOK has no key', () => {
    expect(collectIssues(BASE_STATUS, BASE_SETTINGS)).toEqual(['No API Key']);
  });

  test('reports no issues when BYOK has a key', () => {
    expect(
      collectIssues(BASE_STATUS, { ...BASE_SETTINGS, hasApiKey: true }),
    ).toEqual([]);
  });

  test('reports no issues in cloud-ai mode (effective mode resolved upstream)', () => {
    expect(
      collectIssues(BASE_STATUS, { ...BASE_SETTINGS, aiMode: 'cloud-ai' }),
    ).toEqual([]);
  });
});

describe('StatusBadge', () => {
  test('renders error label with red text when issues are present', () => {
    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={BASE_SETTINGS}
        sync={null}
        issues={['No API Key']}
      />,
    );

    const label = screen.getByText('No API Key');
    expect(label).toBeDefined();
    expect(label.closest('div')?.className).toContain('text-red-600');
  });

  test('renders running state with no issues', () => {
    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={BASE_SETTINGS}
        sync={null}
        issues={[]}
      />,
    );

    expect(screen.getByText('Running')).toBeDefined();
    expect(screen.queryByText(/no api key/i)).toBeNull();
  });

  test('renders "No API Key" as a button that fires onNavigateToApiKey', () => {
    const onNavigateToApiKey = vi.fn();
    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={BASE_SETTINGS}
        sync={null}
        issues={['No API Key']}
        onNavigateToApiKey={onNavigateToApiKey}
      />,
    );

    const button = screen.getByRole('button', { name: 'No API Key' });
    fireEvent.click(button);
    expect(onNavigateToApiKey).toHaveBeenCalledTimes(1);
  });

  test('renders "No API Key" as plain text when no handler is provided', () => {
    render(
      <StatusBadge
        status={BASE_STATUS}
        settings={BASE_SETTINGS}
        sync={null}
        issues={['No API Key']}
      />,
    );

    expect(screen.queryByRole('button', { name: 'No API Key' })).toBeNull();
    expect(screen.getByText('No API Key')).toBeDefined();
  });
});
