import { safeStorage } from 'electron';
import type { ApiKeySource, Settings } from '../shared/types';
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

export async function initSettings(): Promise<void> {
  if (store) return;
  const { default: Store } = await import('electron-store');
  store = new Store<StoreShape>({
    defaults: {
      intervalMs: 5000,
      model: 'gpt-5.4-nano',
      paused: false,
      apiKeyEncrypted: null,
    },
  }) as unknown as StoreInstance;
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
  };
}

export function setSettings(
  patch: Partial<Omit<Settings, 'hasApiKey' | 'apiKeySource' | 'apiKeyHint'>>,
): Settings {
  const s = requireStore();
  if (patch.intervalMs !== undefined) {
    s.set('intervalMs', Math.max(1000, Math.floor(patch.intervalMs)));
  }
  if (patch.model !== undefined) s.set('model', patch.model);
  if (patch.paused !== undefined) s.set('paused', patch.paused);
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
  settingsEmitter.emit(getSettings());
}

export function clearApiKey(): void {
  requireStore().set('apiKeyEncrypted', null);
  settingsEmitter.emit(getSettings());
}

export function getApiKey(): string | null {
  const enc = requireStore().get('apiKeyEncrypted');
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      // fall through to env
    }
  }
  return env.OPENAI_API_KEY ?? null;
}
