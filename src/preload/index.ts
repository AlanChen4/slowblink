import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  AuthSession,
  CaptureStatus,
  Plan,
  Settings,
  SlowblinkAPI,
  SyncStatus,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: unknown, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: SlowblinkAPI = {
  getSamples: (start, end) => ipcRenderer.invoke(IPC.samplesGet, start, end),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
  setApiKey: (key) => ipcRenderer.invoke(IPC.apiKeySet, key),
  clearApiKey: () => ipcRenderer.invoke(IPC.apiKeyClear),
  getStatus: () => ipcRenderer.invoke(IPC.statusGet),
  pause: () => ipcRenderer.invoke(IPC.capturePause),
  resume: () => ipcRenderer.invoke(IPC.captureResume),
  captureOnce: () => ipcRenderer.invoke(IPC.captureOnce),
  requestPermission: () => ipcRenderer.invoke(IPC.permissionRequest),
  openPermissionSettings: () => ipcRenderer.invoke(IPC.permissionOpen),
  requestAccessibilityPermission: () =>
    ipcRenderer.invoke(IPC.permissionAccessibilityRequest),
  openAccessibilityPermissionSettings: () =>
    ipcRenderer.invoke(IPC.permissionAccessibilityOpen),
  deleteAllData: () => ipcRenderer.invoke(IPC.dataDeleteAll),
  getLocalStorageSize: () => ipcRenderer.invoke(IPC.dataStorageSizeGet),
  onStatus: (cb) => subscribe<CaptureStatus>(IPC.statusUpdate, cb),
  onSettings: (cb) => subscribe<Settings>(IPC.settingsUpdate, cb),

  signIn: () => ipcRenderer.invoke(IPC.authSignIn),
  signOut: () => ipcRenderer.invoke(IPC.authSignOut),
  getSession: () => ipcRenderer.invoke(IPC.authSessionGet),
  onSession: (cb) => subscribe<AuthSession | null>(IPC.authSessionUpdate, cb),

  getSyncStatus: () => ipcRenderer.invoke(IPC.syncStatusGet),
  onSyncStatus: (cb) => subscribe<SyncStatus>(IPC.syncStatusUpdate, cb),
  syncFlushNow: () => ipcRenderer.invoke(IPC.syncFlushNow),
  syncRetryFailed: () => ipcRenderer.invoke(IPC.syncRetryFailed),

  getPlan: () => ipcRenderer.invoke(IPC.billingPlanGet),
  onPlan: (cb) => subscribe<Plan>(IPC.billingPlanUpdate, cb),
  openCheckout: () => ipcRenderer.invoke(IPC.billingCheckout),
  openPortal: () => ipcRenderer.invoke(IPC.billingPortal),

  getOverview: (start, end, scope) =>
    ipcRenderer.invoke(IPC.overviewGet, start, end, scope),
  getOverviewDebug: (start, end, scope) =>
    ipcRenderer.invoke(IPC.overviewDebugGet, start, end, scope),
  refreshOverviewDebug: (start, end, scope) =>
    ipcRenderer.invoke(IPC.overviewDebugRefresh, start, end, scope),
};

contextBridge.exposeInMainWorld('slowblink', api);
