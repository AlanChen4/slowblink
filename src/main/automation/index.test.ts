import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiKeySource, AuthSession, Plan } from '../../shared/types';
import type { StoredSettings } from '../settings';
import { createAutomation } from './index';

vi.mock('electron', () => ({
  powerMonitor: { getSystemIdleState: () => 'active' },
}));

async function waitFor(cond: () => boolean, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setImmediate(r));
  }
}

const SIGNED_IN: AuthSession = {
  user: { id: 'u1', email: 'a@example.com', avatarUrl: null },
  expiresAt: Date.now() + 1_000_000,
};
const FREE: Plan = { tier: 'free', renewsAt: null };
const PAID: Plan = { tier: 'paid', renewsAt: null };

const DEFAULT_STORED: StoredSettings = {
  intervalMs: 5000,
  model: 'gpt-test',
  paused: false,
  storageMode: 'local',
  aiMode: 'cloud-ai',
  onboardingComplete: true,
  overviewScope: 'this-device',
  overviewMinDurationMs: 0,
};

interface HarnessOpts {
  stored?: Partial<StoredSettings>;
  session?: AuthSession | null;
  plan?: Plan;
  hasScreen?: boolean;
  hasApiKey?: boolean;
  apiKey?: string | null;
  runner?: () => Promise<void>;
  isIdle?: () => boolean;
}

function makeHarness(opts: HarnessOpts = {}) {
  const stored: StoredSettings = { ...DEFAULT_STORED, ...opts.stored };
  const storeListeners = new Set<() => void>();
  let session: AuthSession | null = opts.session ?? null;
  let plan: Plan = opts.plan ?? FREE;
  let hasScreen = opts.hasScreen ?? true;
  const sessionListeners = new Set<() => void>();
  const planListeners = new Set<() => void>();
  const permissionsListeners = new Set<() => void>();
  const runner = vi.fn(opts.runner ?? (async () => {}));

  const automation = createAutomation({
    store: {
      get: () => ({ ...stored }),
      set: (patch) => {
        Object.assign(stored, patch);
        for (const l of storeListeners) l();
      },
      onChange: (cb) => {
        storeListeners.add(cb);
        return () => storeListeners.delete(cb);
      },
      hasApiKey: () => opts.hasApiKey ?? true,
      apiKeySource: (): ApiKeySource => 'saved',
      apiKeyHint: () => 'sk-…',
      getApiKey: () => opts.apiKey ?? 'test-key',
    },
    session: {
      get: () => session,
      on: (cb) => {
        sessionListeners.add(cb);
        return () => sessionListeners.delete(cb);
      },
    },
    plan: {
      get: () => plan,
      on: (cb) => {
        planListeners.add(cb);
        return () => planListeners.delete(cb);
      },
    },
    permissions: {
      hasScreen: () => hasScreen,
      hasAccessibility: () => true,
      on: (cb) => {
        permissionsListeners.add(cb);
        return () => permissionsListeners.delete(cb);
      },
    },
    runner,
    isIdle: opts.isIdle ?? (() => false),
  });

  return {
    automation,
    runner,
    setSession: (s: AuthSession | null) => {
      session = s;
      for (const l of sessionListeners) l();
    },
    setPlan: (p: Plan) => {
      plan = p;
      for (const l of planListeners) l();
    },
    setHasScreen: (v: boolean) => {
      hasScreen = v;
      for (const l of permissionsListeners) l();
    },
    getStored: () => ({ ...stored }),
  };
}

describe('automation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('cloud-ai + signed-in + paid: loop runs; sign-out stops it', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      hasApiKey: false,
      apiKey: null,
    });
    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    expect(h.automation.getState().status.running).toBe(true);
    expect(h.automation.getState().settings.aiMode).toBe('cloud-ai');
    expect(h.runner).toHaveBeenCalled();

    h.setSession(null);
    // Effective aiMode now degrades to byo-key; without a key, capture must stop.
    expect(h.automation.getState().settings.aiMode).toBe('byo-key');
    expect(h.automation.getState().status.running).toBe(false);
  });

  test('cloud-ai stored + free plan: effective is byo-key; loop only runs when hasApiKey', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: FREE,
      hasApiKey: true,
    });
    h.automation.start();
    expect(h.automation.getState().settings.aiMode).toBe('byo-key');
    expect(h.automation.getState().status.running).toBe(true);

    const h2 = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: FREE,
      hasApiKey: false,
    });
    h2.automation.start();
    expect(h2.automation.getState().settings.aiMode).toBe('byo-key');
    expect(h2.automation.getState().status.running).toBe(false);
  });

  test('three runner failures auto-pause without persisting paused', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      runner: async () => {
        throw new Error('boom');
      },
    });
    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    const state = h.automation.getState();
    expect(state.reasons.autoPaused).toBe('boom');
    expect(state.status.running).toBe(false);
    expect(h.getStored().paused).toBe(false);
  });

  test('start() after auto-pause resets failure state and resumes', async () => {
    let calls = 0;
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      runner: async () => {
        calls += 1;
        if (calls <= 3) throw new Error('boom');
      },
    });
    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.automation.getState().reasons.autoPaused).toBe('boom');

    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    expect(h.automation.getState().reasons.autoPaused).toBeNull();
    expect(h.automation.getState().status.running).toBe(true);
  });

  test('applyIntent({paused: true}) stops the loop and persists; resume restarts', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
    });
    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    expect(h.automation.getState().status.running).toBe(true);

    h.automation.applyIntent({ paused: true });
    expect(h.automation.getState().status.running).toBe(false);
    expect(h.getStored().paused).toBe(true);

    h.automation.applyIntent({ paused: false });
    expect(h.automation.getState().status.running).toBe(true);
    expect(h.getStored().paused).toBe(false);
  });

  test('captureNow() awaits in-flight tick, runs forced, propagates errors', async () => {
    vi.useRealTimers();
    const resolvers: (() => void)[] = [];
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      runner: () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    });
    h.automation.start();
    // Wait for the first periodic tick to enter runner.
    await waitFor(() => resolvers.length >= 1);
    expect(resolvers.length).toBe(1);

    const forcedPromise = h.automation.captureNow();
    // Forced call must wait for the in-flight tick — second runner not yet invoked.
    await new Promise((r) => setImmediate(r));
    expect(resolvers.length).toBe(1);

    resolvers[0]?.();
    await waitFor(() => resolvers.length >= 2);
    resolvers[1]?.();
    await forcedPromise;
    expect(h.runner).toHaveBeenCalledTimes(2);

    h.automation.stop();

    const h2 = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      hasScreen: false,
    });
    h2.automation.start();
    await expect(h2.automation.captureNow()).rejects.toThrow(
      'Screen recording permission not granted',
    );
    h2.automation.stop();
  });

  test('permissions emitter unsticks the loop without explicit prodding', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai' },
      session: SIGNED_IN,
      plan: PAID,
      hasScreen: false,
    });
    h.automation.start();
    expect(h.automation.getState().status.running).toBe(false);
    expect(h.automation.getState().status.hasPermission).toBe(false);

    h.setHasScreen(true);
    expect(h.automation.getState().status.running).toBe(true);
    expect(h.automation.getState().status.hasPermission).toBe(true);
    expect(h.getStored().paused).toBe(false);
  });

  test('applyIntent({intervalMs}) re-arms the timer at the new interval', async () => {
    const h = makeHarness({
      stored: { aiMode: 'cloud-ai', intervalMs: 5000 },
      session: SIGNED_IN,
      plan: PAID,
    });
    h.automation.start();
    await vi.runOnlyPendingTimersAsync();
    const callsAfterStart = h.runner.mock.calls.length;
    expect(callsAfterStart).toBeGreaterThanOrEqual(1);

    h.runner.mockClear();
    h.automation.applyIntent({ intervalMs: 1000 });
    // Immediate tick from re-armed timer.
    await Promise.resolve();
    await Promise.resolve();
    // Three more ticks at 1000ms intervals.
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.runner.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
