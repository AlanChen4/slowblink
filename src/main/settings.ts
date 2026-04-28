import { safeStorage } from 'electron';
import type {
  AIMode,
  ApiKeySource,
  OverviewScope,
  Plan,
  Settings,
  SettingsPatch,
  StorageMode,
} from '../shared/types';
import { getCurrentSession } from './auth/session';
import { getPlan } from './billing/plan-cache';
import { effectiveAiMode } from './effective-ai-mode';
import { createEmitter } from './emitter';
import { env } from './env';

function apiKeySource(hasSaved: boolean, hasEnv: boolean): ApiKeySource {
  if (hasSaved) return 'saved';
  if (hasEnv) return 'env';
  return null;
}

function maskKey(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

interface StoreShape {
  intervalMs: number;
  model: string;
  paused: boolean;
  apiKeyEncrypted: string | null;
  storageMode: StorageMode;
  aiMode: AIMode;
  onboardingComplete: boolean;
  supabaseSessionEncrypted: string | null;
  planCache: Plan | null;
  overviewScope: OverviewScope;
  overviewMinDurationMs: number;
}

// electron-store v10 is ESM-only; load it lazily via dynamic import so this
// CommonJS bundle can consume it. initSettings() must be awaited during
// app startup before any of the exports below are called.
type StoreInstance = {
  get<K extends keyof StoreShape>(key: K): StoreShape[K];
  set<K extends keyof StoreShape>(key: K, value: StoreShape[K]): void;
};

const settingsEmitter = createEmitter<Settings>();
export const onSettingsChange = settingsEmitter.on;

let store: StoreInstance | null = null;

// Cache of the decrypted API key keyed by the ciphertext on disk. Keying by
// ciphertext means any path that rewrites `apiKeyEncrypted` (even ones we
// don't fully control, e.g. electron-store migrations) forces a re-decrypt
// on the next read instead of returning a stale plaintext.
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
      overviewMinDurationMs: 5 * 60 * 1000,
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

export function getSettings(): Settings {
  const s = requireStore();
  const hasSaved = !!s.get('apiKeyEncrypted');
  const hasEnv = !!env.OPENAI_API_KEY;
  const activeKey = getApiKey();
  return {
    intervalMs: s.get('intervalMs'),
    model: s.get('model'),
    paused: s.get('paused'),
    hasApiKey: hasSaved || hasEnv,
    apiKeySource: apiKeySource(hasSaved, hasEnv),
    apiKeyHint: activeKey ? maskKey(activeKey) : null,
    storageMode: s.get('storageMode'),
    aiMode: effectiveAiMode(s.get('aiMode'), getCurrentSession(), getPlan()),
    onboardingComplete: s.get('onboardingComplete'),
    overviewScope: s.get('overviewScope'),
    overviewMinDurationMs: s.get('overviewMinDurationMs'),
  };
}

export function refreshSettings(): void {
  settingsEmitter.emit(getSettings());
}

export function setSettings(patch: SettingsPatch): Settings {
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
  if (patch.overviewMinDurationMs !== undefined) {
    s.set('overviewMinDurationMs', Math.max(0, patch.overviewMinDurationMs));
  }
  const result = getSettings();
  settingsEmitter.emit(result);
  return result;
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this system');
  }
  const enc = safeStorage.encryptString(key).toString('base64');
  requireStore().set('apiKeyEncrypted', enc);
  decryptedKeyCache = { enc, key };
  settingsEmitter.emit(getSettings());
}

export function clearApiKey(): void {
  requireStore().set('apiKeyEncrypted', null);
  decryptedKeyCache = null;
  settingsEmitter.emit(getSettings());
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
