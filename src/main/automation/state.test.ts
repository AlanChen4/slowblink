import { describe, expect, test } from 'vitest';
import type {
  ApiKeySource,
  AuthSession,
  CaptureStatus,
  Plan,
  Settings,
} from '../../shared/types';
import type { StoredSettings } from '../settings';
import {
  type AutomationRuntime,
  type AutomationState,
  automationStateEqual,
  composeAutomationState,
  deriveSettings,
  deriveStatus,
  type PermissionsAdapter,
  type SettingsStore,
} from './state';

const SIGNED_IN: AuthSession = {
  user: { id: 'u1', email: 'a@example.com', avatarUrl: null },
  expiresAt: Date.now() + 1_000_000,
};
const FREE: Plan = { tier: 'free', renewsAt: null };
const PAID: Plan = { tier: 'paid', renewsAt: null };

const STORED: StoredSettings = {
  intervalMs: 5000,
  model: 'gpt-test',
  paused: false,
  storageMode: 'local',
  aiMode: 'cloud-ai',
  onboardingComplete: true,
  overviewScope: 'this-device',
  overviewMinDurationMs: 0,
};

const STORE_FRAGMENT: Pick<
  SettingsStore,
  'hasApiKey' | 'apiKeySource' | 'apiKeyHint'
> = {
  hasApiKey: () => true,
  apiKeySource: (): ApiKeySource => 'saved',
  apiKeyHint: () => 'sk-…',
};

const PERMISSIONS_ALL: PermissionsAdapter = {
  hasScreen: () => true,
  hasAccessibility: () => true,
  on: () => () => {},
};

const RUNTIME_IDLE: AutomationRuntime = {
  timer: null,
  lastError: null,
  autoPaused: null,
};

describe('deriveSettings', () => {
  test('cloud-ai + signed-in + paid stays cloud-ai', () => {
    const s = deriveSettings(STORED, SIGNED_IN, PAID, STORE_FRAGMENT);
    expect(s.aiMode).toBe('cloud-ai');
  });

  test('cloud-ai + signed-out downgrades to byo-key', () => {
    const s = deriveSettings(STORED, null, PAID, STORE_FRAGMENT);
    expect(s.aiMode).toBe('byo-key');
  });

  test('cloud-ai + free plan downgrades to byo-key', () => {
    const s = deriveSettings(STORED, SIGNED_IN, FREE, STORE_FRAGMENT);
    expect(s.aiMode).toBe('byo-key');
  });

  test('byo-key passes through regardless of session/plan', () => {
    const stored: StoredSettings = { ...STORED, aiMode: 'byo-key' };
    expect(deriveSettings(stored, null, FREE, STORE_FRAGMENT).aiMode).toBe(
      'byo-key',
    );
    expect(deriveSettings(stored, SIGNED_IN, PAID, STORE_FRAGMENT).aiMode).toBe(
      'byo-key',
    );
  });

  test('hasApiKey/apiKeySource/apiKeyHint are pulled from the store', () => {
    const store: typeof STORE_FRAGMENT = {
      hasApiKey: () => false,
      apiKeySource: () => null,
      apiKeyHint: () => null,
    };
    const s = deriveSettings(STORED, SIGNED_IN, PAID, store);
    expect(s.hasApiKey).toBe(false);
    expect(s.apiKeySource).toBeNull();
    expect(s.apiKeyHint).toBeNull();
  });
});

describe('deriveStatus', () => {
  const settings: Settings = {
    intervalMs: 5000,
    model: 'gpt-test',
    paused: false,
    hasApiKey: true,
    apiKeySource: 'saved',
    apiKeyHint: 'sk-…',
    storageMode: 'local',
    aiMode: 'cloud-ai',
    onboardingComplete: true,
    overviewScope: 'this-device',
    overviewMinDurationMs: 0,
  };

  test('running mirrors timer presence', () => {
    const stopped = deriveStatus(settings, RUNTIME_IDLE, PERMISSIONS_ALL);
    expect(stopped.running).toBe(false);

    const running = deriveStatus(
      settings,
      { ...RUNTIME_IDLE, timer: setInterval(() => {}, 1_000) },
      PERMISSIONS_ALL,
    );
    expect(running.running).toBe(true);
  });

  test('autoPaused overrides lastError in status.lastError', () => {
    const status = deriveStatus(
      settings,
      {
        ...RUNTIME_IDLE,
        lastError: 'transient',
        autoPaused: 'auto-pause reason',
      },
      PERMISSIONS_ALL,
    );
    expect(status.lastError).toBe('auto-pause reason');
  });

  test('lastError surfaces when autoPaused is null', () => {
    const status = deriveStatus(
      settings,
      { ...RUNTIME_IDLE, lastError: 'transient' },
      PERMISSIONS_ALL,
    );
    expect(status.lastError).toBe('transient');
  });

  test('hasApiKey is true under cloud-ai regardless of saved key', () => {
    const status = deriveStatus(
      { ...settings, aiMode: 'cloud-ai', hasApiKey: false },
      RUNTIME_IDLE,
      PERMISSIONS_ALL,
    );
    expect(status.hasApiKey).toBe(true);
  });

  test('hasApiKey reflects saved key under byo-key', () => {
    const without = deriveStatus(
      { ...settings, aiMode: 'byo-key', hasApiKey: false },
      RUNTIME_IDLE,
      PERMISSIONS_ALL,
    );
    expect(without.hasApiKey).toBe(false);

    const withKey = deriveStatus(
      { ...settings, aiMode: 'byo-key', hasApiKey: true },
      RUNTIME_IDLE,
      PERMISSIONS_ALL,
    );
    expect(withKey.hasApiKey).toBe(true);
  });
});

describe('composeAutomationState', () => {
  test('builds a full state from stored settings + adapters + runtime', () => {
    const state = composeAutomationState(
      {
        store: {
          get: () => STORED,
          set: () => {},
          onChange: () => () => {},
          getApiKey: () => 'k',
          ...STORE_FRAGMENT,
        },
        session: { get: () => SIGNED_IN, on: () => () => {} },
        plan: { get: () => PAID, on: () => () => {} },
        permissions: PERMISSIONS_ALL,
      },
      RUNTIME_IDLE,
    );
    expect(state.settings.aiMode).toBe('cloud-ai');
    expect(state.status.running).toBe(false);
    expect(state.reasons.autoPaused).toBeNull();
  });
});

describe('automationStateEqual', () => {
  const base: AutomationState = composeAutomationState(
    {
      store: {
        get: () => STORED,
        set: () => {},
        onChange: () => () => {},
        getApiKey: () => 'k',
        ...STORE_FRAGMENT,
      },
      session: { get: () => SIGNED_IN, on: () => () => {} },
      plan: { get: () => PAID, on: () => () => {} },
      permissions: PERMISSIONS_ALL,
    },
    RUNTIME_IDLE,
  );

  test('identical states are equal', () => {
    expect(automationStateEqual(base, { ...base })).toBe(true);
  });

  test('settings difference breaks equality', () => {
    const next: AutomationState = {
      ...base,
      settings: { ...base.settings, intervalMs: base.settings.intervalMs + 1 },
    };
    expect(automationStateEqual(base, next)).toBe(false);
  });

  test('status difference breaks equality', () => {
    const status: CaptureStatus = {
      ...base.status,
      running: !base.status.running,
    };
    const next: AutomationState = { ...base, status };
    expect(automationStateEqual(base, next)).toBe(false);
  });

  test('reasons.autoPaused difference breaks equality', () => {
    const next: AutomationState = {
      ...base,
      reasons: { autoPaused: 'because' },
    };
    expect(automationStateEqual(base, next)).toBe(false);
  });
});
