import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { CaptureStatus, Settings, SlowblinkAPI } from '../shared/types';

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
  onStatus: (cb) => {
    const listener = (_e: unknown, s: CaptureStatus) => cb(s);
    ipcRenderer.on(IPC.statusUpdate, listener);
    return () => ipcRenderer.removeListener(IPC.statusUpdate, listener);
  },
  onSettings: (cb) => {
    const listener = (_e: unknown, s: Settings) => cb(s);
    ipcRenderer.on(IPC.settingsUpdate, listener);
    return () => ipcRenderer.removeListener(IPC.settingsUpdate, listener);
  },
};

contextBridge.exposeInMainWorld('slowblink', api);
