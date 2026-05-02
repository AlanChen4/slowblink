import type {
  ApiKeySource,
  AuthSession,
  CaptureStatus,
  Plan,
  Settings,
  SettingsPatch,
} from '../../shared/types';
import type { StoredSettings } from '../settings';
import { effectiveAiMode } from './effective-mode';

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
  on(cb: () => void): () => void;
}

export interface StateDeps {
  store: SettingsStore;
  session: SessionAdapter;
  plan: PlanAdapter;
  permissions: PermissionsAdapter;
}

export interface AutomationRuntime {
  timer: NodeJS.Timeout | null;
  lastError: string | null;
  lastCaptureTs: number | null;
  autoPaused: string | null;
}

export interface AutomationState {
  settings: Settings;
  status: CaptureStatus;
  reasons: { autoPaused: string | null };
}

export function deriveSettings(
  stored: StoredSettings,
  session: AuthSession | null,
  plan: Plan,
  store: Pick<SettingsStore, 'hasApiKey' | 'apiKeySource' | 'apiKeyHint'>,
): Settings {
  return {
    intervalMs: stored.intervalMs,
    model: stored.model,
    paused: stored.paused,
    hasApiKey: store.hasApiKey(),
    apiKeySource: store.apiKeySource(),
    apiKeyHint: store.apiKeyHint(),
    storageMode: stored.storageMode,
    aiMode: effectiveAiMode(stored.aiMode, session, plan),
    onboardingComplete: stored.onboardingComplete,
    overviewScope: stored.overviewScope,
    overviewMinDurationMs: stored.overviewMinDurationMs,
  };
}

export function deriveStatus(
  settings: Settings,
  runtime: AutomationRuntime,
  permissions: PermissionsAdapter,
): CaptureStatus {
  return {
    running: runtime.timer !== null,
    lastError: runtime.autoPaused ?? runtime.lastError,
    lastCaptureTs: runtime.lastCaptureTs,
    hasPermission: permissions.hasScreen(),
    hasAccessibility: permissions.hasAccessibility(),
    hasApiKey: settings.aiMode === 'cloud-ai' ? true : settings.hasApiKey,
  };
}

export function composeAutomationState(
  deps: StateDeps,
  runtime: AutomationRuntime,
): AutomationState {
  const settings = deriveSettings(
    deps.store.get(),
    deps.session.get(),
    deps.plan.get(),
    deps.store,
  );
  const status = deriveStatus(settings, runtime, deps.permissions);
  return { settings, status, reasons: { autoPaused: runtime.autoPaused } };
}

export function automationStateEqual(
  a: AutomationState,
  b: AutomationState,
): boolean {
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
