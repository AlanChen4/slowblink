import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/ipc-channels';
import {
  captureOnce,
  getStatus,
  onStatusChange,
  refreshStatus,
} from './capture';
import { deleteAll, getSamples } from './db';
import {
  hasScreenPermission,
  openAccessibilityPermissionSettings,
  openScreenPermissionSettings,
  requestAccessibilityPermission,
  requestScreenPermission,
} from './permissions';
import {
  clearApiKey,
  getSettings,
  onSettingsChange,
  setApiKey,
  setSettings,
} from './settings';

export function registerIpc() {
  ipcMain.handle(IPC.samplesGet, (_e, start: number, end: number) =>
    getSamples(start, end),
  );

  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, patch) => setSettings(patch));

  ipcMain.handle(IPC.apiKeySet, (_e, key: string) => {
    setApiKey(key);
    return getSettings();
  });
  ipcMain.handle(IPC.apiKeyClear, () => clearApiKey());

  ipcMain.handle(IPC.statusGet, () => getStatus());

  ipcMain.handle(IPC.capturePause, () => setSettings({ paused: true }));
  ipcMain.handle(IPC.captureResume, () => setSettings({ paused: false }));
  ipcMain.handle(IPC.captureOnce, () => captureOnce(true));

  ipcMain.handle(IPC.permissionRequest, async () => {
    const granted = await requestScreenPermission();
    refreshStatus();
    return granted;
  });
  ipcMain.handle(IPC.permissionOpen, () => openScreenPermissionSettings());
  ipcMain.handle(IPC.permissionHas, () => hasScreenPermission());

  ipcMain.handle(IPC.permissionAccessibilityRequest, async () => {
    const granted = await requestAccessibilityPermission();
    refreshStatus();
    return granted;
  });
  ipcMain.handle(IPC.permissionAccessibilityOpen, () =>
    openAccessibilityPermissionSettings(),
  );

  ipcMain.handle(IPC.dataDeleteAll, () => deleteAll());
}

function broadcast<T>(
  channel: string,
  subscribe: (cb: (value: T) => void) => () => void,
): () => void {
  return subscribe((value) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, value);
    }
  });
}

export function broadcastStatusUpdates() {
  return broadcast(IPC.statusUpdate, onStatusChange);
}

export function broadcastSettingsUpdates() {
  return broadcast(IPC.settingsUpdate, onSettingsChange);
}
