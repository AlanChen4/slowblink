import { powerMonitor } from 'electron';
import type { Settings, SettingsPatch } from '../../shared/types';
import { createEmitter } from '../emitter';
import { logger } from '../logger';
import {
  createErrorTracker,
  type ErrorTracker,
  formatRunnerError,
} from './error-policy';
import type { Runner } from './runner';
import {
  type AutomationRuntime,
  type AutomationState,
  automationStateEqual,
  composeAutomationState,
  type StateDeps,
} from './state';

export type { AutomationState } from './state';

const ERROR_PAUSE_THRESHOLD = 3;
const IDLE_THRESHOLD_SECONDS = 60;

export interface PowerAdapter {
  onSuspend(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
}

export interface AutomationDeps extends StateDeps {
  runner: Runner;
  isIdle?: () => boolean;
  power?: PowerAdapter;
}

function defaultPower(): PowerAdapter {
  return {
    onSuspend(cb) {
      powerMonitor.on('suspend', cb);
      return () => {
        powerMonitor.off('suspend', cb);
      };
    },
    onResume(cb) {
      powerMonitor.on('resume', cb);
      return () => {
        powerMonitor.off('resume', cb);
      };
    },
  };
}

export interface Automation {
  start(): void;
  stop(): void;
  applyIntent(patch: SettingsPatch): AutomationState;
  captureNow(): Promise<void>;
  getState(): AutomationState;
  subscribe(cb: (s: AutomationState) => void): () => void;
}

export function createAutomation(deps: AutomationDeps): Automation {
  const runner = deps.runner;
  const isIdle =
    deps.isIdle ??
    (() =>
      powerMonitor.getSystemIdleState(IDLE_THRESHOLD_SECONDS) !== 'active');
  const power = deps.power ?? defaultPower();
  const stateEmitter = createEmitter<AutomationState>();
  const errors: ErrorTracker = createErrorTracker({
    threshold: ERROR_PAUSE_THRESHOLD,
  });

  let timer: NodeJS.Timeout | null = null;
  let currentIntervalMs: number | null = null;
  let inFlight: Promise<void> | null = null;
  let lastEmitted: AutomationState | null = null;
  let started = false;
  let suspended = false;
  const unsubs: (() => void)[] = [];

  function runtime(): AutomationRuntime {
    const { lastError, autoPaused } = errors.getState();
    return { timer, lastError, autoPaused };
  }

  function getState(): AutomationState {
    return composeAutomationState(deps, runtime());
  }

  function emit() {
    const next = getState();
    if (lastEmitted && automationStateEqual(lastEmitted, next)) return;
    lastEmitted = next;
    stateEmitter.emit(next);
  }

  function canCapture(settings: Settings): boolean {
    if (suspended) return false;
    if (settings.paused) return false;
    if (errors.getState().autoPaused) return false;
    if (!deps.permissions.hasScreen()) return false;
    if (settings.aiMode === 'byo-key' && !settings.hasApiKey) return false;
    return true;
  }

  function startTimer(intervalMs: number) {
    stopTimer();
    currentIntervalMs = intervalMs;
    timer = setInterval(() => {
      void tick(false);
    }, intervalMs);
    void tick(false);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    currentIntervalMs = null;
  }

  function reconcile() {
    const { settings } = getState();
    if (!canCapture(settings)) {
      stopTimer();
      emit();
      return;
    }
    if (!timer || settings.intervalMs !== currentIntervalMs) {
      startTimer(settings.intervalMs);
    }
    emit();
  }

  function recordFailure(msg: string) {
    if (!started) return;
    if (suspended) return;
    errors.recordFailure(msg);
    if (errors.getState().autoPaused) stopTimer();
    emit();
  }

  function recordSuccess() {
    if (!started) return;
    errors.clearFailures();
    emit();
  }

  async function awaitInFlight() {
    if (!inFlight) return;
    try {
      await inFlight;
    } catch {
      // Swallow — caller decides whether to retry.
    }
  }

  function preflight(force: boolean): {
    apiKey: string | null;
    model: string;
    aiMode: Settings['aiMode'];
  } | null {
    const { settings } = getState();
    if (!deps.permissions.hasScreen()) {
      return guardFail('Screen recording permission not granted', force);
    }
    const apiKey =
      settings.aiMode === 'cloud-ai' ? null : deps.store.getApiKey();
    if (settings.aiMode === 'byo-key' && !apiKey) {
      return guardFail('No API key configured', force);
    }
    if (!force && isIdle()) return null;
    return { apiKey, model: settings.model, aiMode: settings.aiMode };
  }

  function guardFail(msg: string, force: boolean): null {
    if (force) throw new Error(msg);
    recordFailure(msg);
    return null;
  }

  async function runOnce(
    ctx: { apiKey: string | null; model: string; aiMode: Settings['aiMode'] },
    force: boolean,
  ) {
    try {
      await runner(ctx);
      recordSuccess();
    } catch (err) {
      const msg = formatRunnerError(err);
      logger.log('[capture] failed:', msg);
      recordFailure(msg);
      if (force) throw err;
    }
  }

  async function tick(force: boolean): Promise<void> {
    if (inFlight) {
      if (!force) return;
      await awaitInFlight();
    }
    const ctx = preflight(force);
    if (!ctx) return;
    inFlight = runOnce(ctx, force);
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function applyIntent(patch: SettingsPatch): AutomationState {
    if (patch.paused === false) {
      errors.clearFailures();
    }
    deps.store.set(patch);
    return getState();
  }

  function captureNow(): Promise<void> {
    return tick(true);
  }

  function start(): void {
    if (!started) {
      started = true;
      unsubs.push(deps.store.onChange(() => reconcile()));
      unsubs.push(
        deps.session.on(() => {
          errors.clearFailures();
          reconcile();
        }),
      );
      unsubs.push(
        deps.plan.on(() => {
          errors.clearFailures();
          reconcile();
        }),
      );
      unsubs.push(
        deps.permissions.on(() => {
          errors.clearFailures();
          reconcile();
        }),
      );
      unsubs.push(
        power.onSuspend(() => {
          suspended = true;
          stopTimer();
          emit();
        }),
      );
      unsubs.push(
        power.onResume(() => {
          suspended = false;
          errors.clearFailures();
          reconcile();
        }),
      );
    }
    errors.clearFailures();
    reconcile();
  }

  function stop(): void {
    started = false;
    suspended = false;
    stopTimer();
    while (unsubs.length) {
      const dispose = unsubs.pop();
      try {
        dispose?.();
      } catch (err) {
        logger.log('[automation] dispose threw:', err);
      }
    }
    emit();
  }

  return {
    start,
    stop,
    applyIntent,
    captureNow,
    getState,
    subscribe: stateEmitter.on,
  };
}
