import { app, safeStorage } from 'electron';
import type {
  AIMode,
  ApiKeySource,
  OverviewScope,
  Plan,
  SettingsPatch,
  StorageMode,
} from '../shared/types';
import { createEmitter } from './emitter';
import { env } from './env';

export interface StoredSettings {
  intervalMs: number;
  model: string;
  paused: boolean;
  storageMode: StorageMode;
  aiMode: AIMode;
  onboardingComplete: boolean;
  overviewScope: OverviewScope;
}

interface StoreShape extends StoredSettings {
  apiKeyEncrypted: string | null;
  supabaseSessionEncrypted: string | null;
  planCache: Plan | null;
  replayLogging: boolean;
}

type StoreInstance = {
  get<K extends keyof StoreShape>(key: K): StoreShape[K];
  set<K extends keyof StoreShape>(key: K, value: StoreShape[K]): void;
};

const storedSettingsEmitter = createEmitter<StoredSettings>();
export const onStoredSettingsChange = storedSettingsEmitter.on;

let store: StoreInstance | null = null;

let decryptedKeyCache: { enc: string; key: string } | null = null;

export async function initSettings(): Promise<void> {
  if (store) return;
  const { default: Store } = await import('electron-store');
  store = new Store<StoreShape>({
    defaults: {
      intervalMs: 5000,
      model: 'gpt-5.4-nano',
      paused: false,
      apiKeyEncrypted: null,
      storageMode: 'local',
      aiMode: 'byo-key',
      onboardingComplete: false,
      supabaseSessionEncrypted: null,
      planCache: null,
      overviewScope: 'this-device',
      replayLogging: false,
    },
  }) as unknown as StoreInstance;

  // Migration: users who upgrade from a pre-onboarding build and already have
  // an API key configured have effectively completed setup — skip onboarding.
  if (!store.get('onboardingComplete')) {
    const hasKey = !!store.get('apiKeyEncrypted') || !!env.OPENAI_API_KEY;
    if (hasKey) store.set('onboardingComplete', true);
  }
}

function requireStore(): StoreInstance {
  if (!store)
    throw new Error(
      'settings store not initialized; call initSettings() first',
    );
  return store;
}

export function getStoredSettings(): StoredSettings {
  const s = requireStore();
  return {
    intervalMs: s.get('intervalMs'),
    model: s.get('model'),
    paused: s.get('paused'),
    storageMode: s.get('storageMode'),
    aiMode: s.get('aiMode'),
    onboardingComplete: s.get('onboardingComplete'),
    overviewScope: s.get('overviewScope'),
  };
}

export function setStoredSettings(patch: SettingsPatch): StoredSettings {
  const s = requireStore();
  if (patch.intervalMs !== undefined) {
    s.set('intervalMs', Math.max(1000, Math.floor(patch.intervalMs)));
  }
  if (patch.model !== undefined) s.set('model', patch.model);
  if (patch.paused !== undefined) s.set('paused', patch.paused);
  if (patch.storageMode !== undefined) s.set('storageMode', patch.storageMode);
  if (patch.aiMode !== undefined) s.set('aiMode', patch.aiMode);
  if (patch.onboardingComplete !== undefined) {
    s.set('onboardingComplete', patch.onboardingComplete);
  }
  if (patch.overviewScope !== undefined) {
    s.set('overviewScope', patch.overviewScope);
  }
  const next = getStoredSettings();
  storedSettingsEmitter.emit(next);
  return next;
}

export function hasApiKey(): boolean {
  const s = requireStore();
  return !!s.get('apiKeyEncrypted') || !!env.OPENAI_API_KEY;
}

export function apiKeySource(): ApiKeySource {
  const s = requireStore();
  if (s.get('apiKeyEncrypted')) return 'saved';
  if (env.OPENAI_API_KEY) return 'env';
  return null;
}

export function apiKeyHint(): string | null {
  const key = getApiKey();
  return key ? maskKey(key) : null;
}

function maskKey(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this system');
  }
  const enc = safeStorage.encryptString(key).toString('base64');
  requireStore().set('apiKeyEncrypted', enc);
  decryptedKeyCache = { enc, key };
  storedSettingsEmitter.emit(getStoredSettings());
}

export function clearApiKey(): void {
  requireStore().set('apiKeyEncrypted', null);
  decryptedKeyCache = null;
  storedSettingsEmitter.emit(getStoredSettings());
}

export function getApiKey(): string | null {
  const enc = requireStore().get('apiKeyEncrypted');
  if (enc) {
    if (decryptedKeyCache?.enc === enc) return decryptedKeyCache.key;
    try {
      const key = safeStorage.decryptString(Buffer.from(enc, 'base64'));
      decryptedKeyCache = { enc, key };
      return key;
    } catch {
      decryptedKeyCache = null;
      // fall through to env
    }
  }
  return env.OPENAI_API_KEY ?? null;
}

export function getStoredSession(): string | null {
  const enc = requireStore().get('supabaseSessionEncrypted');
  if (!enc) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

export function setStoredSession(json: string | null) {
  const s = requireStore();
  if (json === null) {
    s.set('supabaseSessionEncrypted', null);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this system');
  }
  const enc = safeStorage.encryptString(json).toString('base64');
  s.set('supabaseSessionEncrypted', enc);
}

export function setPlanCache(plan: Plan | null) {
  requireStore().set('planCache', plan);
}

export function getPlanCache(): Plan | null {
  return requireStore().get('planCache');
}

export function isReplayLoggingEnabled(): boolean {
  if (app.isPackaged) return false;
  if (!store) return false;
  return !!store.get('replayLogging');
}

export function setReplayLoggingEnabled(enabled: boolean): boolean {
  if (app.isPackaged) return false;
  requireStore().set('replayLogging', enabled);
  return enabled;
}
