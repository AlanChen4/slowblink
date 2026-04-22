import type { CaptureStatus, Settings } from '@shared/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { collectIssues, StatusBadge } from './StatusBadge';

afterEach(cleanup);

const BASE_STATUS: CaptureStatus = {
  running: true,
  paused: false,
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
      <StatusBadge status={BASE_STATUS} sync={null} issues={['No API Key']} />,
    );

    const label = screen.getByText('No API Key');
    expect(label).toBeDefined();
    expect(label.closest('div')?.className).toContain('text-red-600');
  });

  test('renders running state with no issues', () => {
    render(<StatusBadge status={BASE_STATUS} sync={null} issues={[]} />);

    expect(screen.getByText('Running')).toBeDefined();
    expect(screen.queryByText(/no api key/i)).toBeNull();
  });
});
