export interface Sample {
  id: number;
  ts: number;
  activity: string;
  confidence: number;
  focusedApp: string | null;
  focusedWindow: string | null;
}

export type ApiKeySource = 'saved' | 'env' | null;
export type StorageMode = 'local' | 'cloud-sync';
export type AIMode = 'byo-key' | 'cloud-ai';
export type PlanTier = 'free' | 'paid';
export type SyncState = 'pending' | 'synced' | 'failed';
export type OverviewScope = 'this-device' | 'all-devices';

export interface Settings {
  intervalMs: number;
  model: string;
  paused: boolean;
  hasApiKey: boolean;
  apiKeySource: ApiKeySource;
  apiKeyHint: string | null;
  storageMode: StorageMode;
  aiMode: AIMode;
  onboardingComplete: boolean;
  overviewScope: OverviewScope;
  overviewMinDurationMs: number;
}

export type SettingsPatch = Partial<
  Omit<Settings, 'hasApiKey' | 'apiKeySource' | 'apiKeyHint'>
>;

export interface CaptureStatus {
  running: boolean;
  lastError: string | null;
  lastCaptureTs: number | null;
  hasPermission: boolean;
  hasAccessibility: boolean;
  hasApiKey: boolean;
}

export interface User {
  id: string;
  email: string;
  avatarUrl: string | null;
}

export interface AuthSession {
  user: User;
  expiresAt: number;
}

export interface Plan {
  tier: PlanTier;
  renewsAt: number | null;
}

export type SyncRuntimeState =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'paused'
  | 'disabled';

export interface SyncStatus {
  enabled: boolean;
  state: SyncRuntimeState;
  lastFlushTs: number | null;
  pending: number;
  synced: number;
  failed: number;
  lastError: string | null;
}

export interface Segment {
  startTs: number;
  endTs: number;
  durationMs: number;
  focusedApp: string | null;
  focusedWindow: string | null;
}

export interface WindowDuration {
  window: string;
  durationMs: number;
}

export interface AppDuration {
  app: string;
  durationMs: number;
  windows: WindowDuration[];
}

export interface OverviewAggregate {
  apps: AppDuration[];
}

export interface Overview {
  scope: OverviewScope;
  rangeStart: number;
  rangeEnd: number;
  segments: Segment[];
  aggregate: OverviewAggregate;
}

export interface OverviewDebug {
  range: {
    startTs: number;
    endTs: number;
    rangeKey: string;
    scope: OverviewScope;
    timezone: string;
  };
  samples: Sample[];
  segments: Segment[];
  aggregate: OverviewAggregate;
}

export interface SlowblinkAPI {
  getSamples(rangeStart: number, rangeEnd: number): Promise<Sample[]>;
  getSettings(): Promise<Settings>;
  setSettings(patch: SettingsPatch): Promise<Settings>;
  setApiKey(key: string): Promise<Settings>;
  clearApiKey(): Promise<void>;
  getStatus(): Promise<CaptureStatus>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  captureOnce(): Promise<void>;
  requestPermission(): Promise<boolean>;
  openPermissionSettings(): Promise<void>;
  requestAccessibilityPermission(): Promise<boolean>;
  openAccessibilityPermissionSettings(): Promise<void>;
  deleteAllData(): Promise<void>;
  getLocalStorageSize(): Promise<number>;
  onStatus(cb: (s: CaptureStatus) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;

  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  onSession(cb: (s: AuthSession | null) => void): () => void;

  getSyncStatus(): Promise<SyncStatus>;
  onSyncStatus(cb: (s: SyncStatus) => void): () => void;
  syncFlushNow(): Promise<void>;
  syncRetryFailed(): Promise<void>;

  getPlan(): Promise<Plan>;
  onPlan(cb: (p: Plan) => void): () => void;
  openCheckout(): Promise<void>;
  openPortal(): Promise<void>;

  getOverview(
    rangeStart: number,
    rangeEnd: number,
    scope: OverviewScope,
  ): Promise<Overview>;
  getOverviewDebug(
    rangeStart: number,
    rangeEnd: number,
    scope: OverviewScope,
  ): Promise<OverviewDebug>;
  refreshOverviewDebug(
    rangeStart: number,
    rangeEnd: number,
    scope: OverviewScope,
  ): Promise<OverviewDebug>;
}

declare global {
  interface Window {
    slowblink: SlowblinkAPI;
  }
}
