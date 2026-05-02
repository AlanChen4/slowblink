import { powerMonitor } from 'electron';
import type {
  ApiKeySource,
  AuthSession,
  CaptureStatus,
  Plan,
  Settings,
  SettingsPatch,
} from '../../shared/types';
import { createEmitter } from '../emitter';
import type { StoredSettings } from '../settings';
import { effectiveAiMode } from './effective-mode';
import type { Runner } from './runner';

const ERROR_PAUSE_THRESHOLD = 3;
const IDLE_THRESHOLD_SECONDS = 60;

export interface AutomationState {
  settings: Settings;
  status: CaptureStatus;
  reasons: { autoPaused: string | null };
}

export interface SettingsStore {
  get(): StoredSettings;
  set(patch: SettingsPatch): void;
  onChange(cb: () => void): () => void;
  hasApiKey(): boolean;
  apiKeySource(): ApiKeySource;
  apiKeyHint(): string | null;
  getApiKey(): string | null;
}

export interface SessionAdapter {
  get(): AuthSession | null;
  on(cb: () => void): () => void;
}

export interface PlanAdapter {
  get(): Plan;
  on(cb: () => void): () => void;
}

export interface PermissionsAdapter {
  hasScreen(): boolean;
  hasAccessibility(): boolean;
}

export interface AutomationDeps {
  store: SettingsStore;
  session: SessionAdapter;
  plan: PlanAdapter;
  permissions: PermissionsAdapter;
  runner: Runner;
  isIdle?: () => boolean;
}

export interface Automation {
  start(): void;
  stop(): void;
  applyIntent(patch: SettingsPatch): AutomationState;
  captureNow(): Promise<void>;
  notifyPermissionsChanged(): void;
  getState(): AutomationState;
  subscribe(cb: (s: AutomationState) => void): () => void;
}

export function createAutomation(deps: AutomationDeps): Automation {
  const runner = deps.runner;
  const isIdle =
    deps.isIdle ??
    (() =>
      powerMonitor.getSystemIdleState(IDLE_THRESHOLD_SECONDS) !== 'active');
  const stateEmitter = createEmitter<AutomationState>();

  let timer: NodeJS.Timeout | null = null;
  let currentIntervalMs: number | null = null;
  let inFlight: Promise<void> | null = null;
  let consecutiveErrors = 0;
  let lastError: string | null = null;
  let lastCaptureTs: number | null = null;
  let autoPaused: string | null = null;
  let lastEmitted: AutomationState | null = null;
  let started = false;
  const unsubs: (() => void)[] = [];

  function projectSettings(): Settings {
    const stored = deps.store.get();
    const aiMode = effectiveAiMode(
      stored.aiMode,
      deps.session.get(),
      deps.plan.get(),
    );
    return {
      intervalMs: stored.intervalMs,
      model: stored.model,
      paused: stored.paused,
      hasApiKey: deps.store.hasApiKey(),
      apiKeySource: deps.store.apiKeySource(),
      apiKeyHint: deps.store.apiKeyHint(),
      storageMode: stored.storageMode,
      aiMode,
      onboardingComplete: stored.onboardingComplete,
      overviewScope: stored.overviewScope,
      overviewMinDurationMs: stored.overviewMinDurationMs,
    };
  }

  function projectStatus(settings: Settings): CaptureStatus {
    return {
      running: timer !== null,
      lastError: autoPaused ?? lastError,
      lastCaptureTs,
      hasPermission: deps.permissions.hasScreen(),
      hasAccessibility: deps.permissions.hasAccessibility(),
      hasApiKey: settings.aiMode === 'cloud-ai' ? true : settings.hasApiKey,
    };
  }

  function getState(): AutomationState {
    const settings = projectSettings();
    const status = projectStatus(settings);
    return { settings, status, reasons: { autoPaused } };
  }

  function emit() {
    const next = getState();
    if (lastEmitted && stateEqual(lastEmitted, next)) return;
    lastEmitted = next;
    stateEmitter.emit(next);
  }

  function canCapture(settings: Settings): boolean {
    if (settings.paused) return false;
    if (autoPaused) return false;
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
    const settings = projectSettings();
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
    lastError = msg;
    consecutiveErrors += 1;
    if (consecutiveErrors >= ERROR_PAUSE_THRESHOLD) {
      autoPaused = msg;
      stopTimer();
    }
    emit();
  }

  function recordSuccess(sampleTs: number) {
    lastCaptureTs = sampleTs;
    lastError = null;
    consecutiveErrors = 0;
    autoPaused = null;
    emit();
  }

  function resetTransientFailureState() {
    consecutiveErrors = 0;
    lastError = null;
    autoPaused = null;
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
    const settings = projectSettings();
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
      const { sampleTs } = await runner(ctx);
      recordSuccess(sampleTs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
    const before = deps.store.get();
    if (patch.paused === false && before.paused) {
      resetTransientFailureState();
    }
    deps.store.set(patch);
    return getState();
  }

  function captureNow(): Promise<void> {
    return tick(true);
  }

  function notifyPermissionsChanged(): void {
    resetTransientFailureState();
    reconcile();
  }

  function start(): void {
    if (!started) {
      started = true;
      unsubs.push(deps.store.onChange(() => reconcile()));
      unsubs.push(
        deps.session.on(() => {
          resetTransientFailureState();
          reconcile();
        }),
      );
      unsubs.push(
        deps.plan.on(() => {
          resetTransientFailureState();
          reconcile();
        }),
      );
    }
    resetTransientFailureState();
    reconcile();
  }

  function stop(): void {
    started = false;
    stopTimer();
    while (unsubs.length) {
      const dispose = unsubs.pop();
      try {
        dispose?.();
      } catch (err) {
        console.log('[automation] dispose threw:', err);
      }
    }
    emit();
  }

  return {
    start,
    stop,
    applyIntent,
    captureNow,
    notifyPermissionsChanged,
    getState,
    subscribe: stateEmitter.on,
  };
}

function stateEqual(a: AutomationState, b: AutomationState): boolean {
  return (
    settingsEqual(a.settings, b.settings) &&
    statusEqual(a.status, b.status) &&
    a.reasons.autoPaused === b.reasons.autoPaused
  );
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.intervalMs === b.intervalMs &&
    a.model === b.model &&
    a.paused === b.paused &&
    a.hasApiKey === b.hasApiKey &&
    a.apiKeySource === b.apiKeySource &&
    a.apiKeyHint === b.apiKeyHint &&
    a.storageMode === b.storageMode &&
    a.aiMode === b.aiMode &&
    a.onboardingComplete === b.onboardingComplete &&
    a.overviewScope === b.overviewScope &&
    a.overviewMinDurationMs === b.overviewMinDurationMs
  );
}

function statusEqual(a: CaptureStatus, b: CaptureStatus): boolean {
  return (
    a.running === b.running &&
    a.lastError === b.lastError &&
    a.lastCaptureTs === b.lastCaptureTs &&
    a.hasPermission === b.hasPermission &&
    a.hasAccessibility === b.hasAccessibility &&
    a.hasApiKey === b.hasApiKey
  );
}
