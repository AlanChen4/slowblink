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

export interface Settings {
  intervalMs: number;
  model: string;
  paused: boolean;
  hasApiKey: boolean;
  apiKeySource: ApiKeySource;
  apiKeyHint: string | null;
}

export interface CaptureStatus {
  running: boolean;
  paused: boolean;
  lastError: string | null;
  lastCaptureTs: number | null;
  hasPermission: boolean;
  hasAccessibility: boolean;
  hasApiKey: boolean;
}

export interface SlowblinkAPI {
  getSamples(rangeStart: number, rangeEnd: number): Promise<Sample[]>;
  getSettings(): Promise<Settings>;
  setSettings(
    patch: Partial<Omit<Settings, 'hasApiKey' | 'apiKeySource' | 'apiKeyHint'>>,
  ): Promise<Settings>;
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
  onStatus(cb: (s: CaptureStatus) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
}

declare global {
  interface Window {
    slowblink: SlowblinkAPI;
  }
}
