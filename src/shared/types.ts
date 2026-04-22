export const CATEGORIES = [
  'coding',
  'writing',
  'communication',
  'browsing',
  'meeting',
  'media',
  'design',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Sample {
  id: number;
  ts: number;
  activity: string;
  category: Category;
  confidence: number;
  focusedApp: string | null;
  focusedWindow: string | null;
  openWindows: { app: string; title: string }[];
}

export type ApiKeySource = 'saved' | 'env' | null;
export type StorageMode = 'local' | 'cloud-sync';
export type AIMode = 'byo-key' | 'cloud-ai';
export type PlanTier = 'free' | 'paid';
export type SyncState = 'pending' | 'synced' | 'failed';

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
}

export type SettingsPatch = Partial<
  Omit<Settings, 'hasApiKey' | 'apiKeySource' | 'apiKeyHint'>
>;

export interface CaptureStatus {
  running: boolean;
  paused: boolean;
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
}

declare global {
  interface Window {
    slowblink: SlowblinkAPI;
  }
}
