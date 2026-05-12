import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { CaptureStatus, OverviewScope, Settings } from '../shared/types';
import { signInWithGoogle } from './auth/oauth';
import {
  signOut as authSignOut,
  getCurrentSession,
  onSessionChange,
} from './auth/session';
import type { Automation } from './automation';
import { settingsEqual, statusEqual } from './automation/state';
import { openCheckout, openPortal } from './billing/checkout';
import { getPlan, onPlanChange } from './billing/plan-cache';
import {
  deleteAll,
  getAppIconsForNames,
  getLocalStorageSize,
  getSamples,
  onSampleInserted,
} from './db';
import { getLogBuffer, onLogEntry } from './logger';
import { getOverview } from './overview';
import { getOverviewDebug, refreshOverviewDebug } from './overview/debug';
import {
  hasScreenPermission,
  openAccessibilityPermissionSettings,
  openScreenPermissionSettings,
  requestAccessibilityPermission,
  requestScreenPermission,
} from './permissions';
import {
  clearApiKey,
  isReplayLoggingEnabled,
  setApiKey,
  setReplayLoggingEnabled,
} from './settings';
import {
  flushNow,
  getSyncStatus,
  onSyncStatusChange,
  retryFailed,
} from './sync/flusher';

export function registerIpc(automation: Automation) {
  ipcMain.handle(IPC.samplesGet, (_e, start: number, end: number) =>
    getSamples(start, end),
  );

  ipcMain.handle(
    IPC.overviewGet,
    (_e, start: number, end: number, scope: OverviewScope) =>
      getOverview(start, end, scope),
  );
  ipcMain.handle(
    IPC.overviewDebugGet,
    (_e, start: number, end: number, scope: OverviewScope) =>
      getOverviewDebug(start, end, scope),
  );
  ipcMain.handle(
    IPC.overviewDebugRefresh,
    (_e, start: number, end: number, scope: OverviewScope) =>
      refreshOverviewDebug(start, end, scope),
  );

  ipcMain.handle(IPC.appIconsGet, (_e, names: unknown) => {
    if (!Array.isArray(names)) return {};
    const safeNames = names.filter((n): n is string => typeof n === 'string');
    const icons = getAppIconsForNames(safeNames);
    const out: Record<string, string | null> = {};
    for (const name of safeNames) {
      out[name] = icons.get(name)?.dataUrl ?? null;
    }
    return out;
  });

  ipcMain.handle(IPC.settingsGet, () => automation.getState().settings);
  ipcMain.handle(
    IPC.settingsSet,
    (_e, patch) => automation.applyIntent(patch).settings,
  );

  ipcMain.handle(IPC.apiKeySet, (_e, key: string) => {
    setApiKey(key);
    return automation.getState().settings;
  });
  ipcMain.handle(IPC.apiKeyClear, () => clearApiKey());

  ipcMain.handle(IPC.statusGet, () => automation.getState().status);

  ipcMain.handle(IPC.capturePause, () => {
    automation.applyIntent({ paused: true });
  });
  ipcMain.handle(IPC.captureResume, () => {
    automation.applyIntent({ paused: false });
  });
  ipcMain.handle(IPC.captureOnce, () => automation.captureNow());

  ipcMain.handle(IPC.permissionRequest, () => requestScreenPermission());
  ipcMain.handle(IPC.permissionOpen, () => openScreenPermissionSettings());
  ipcMain.handle(IPC.permissionHas, () => hasScreenPermission());

  ipcMain.handle(IPC.permissionAccessibilityRequest, () =>
    requestAccessibilityPermission(),
  );
  ipcMain.handle(IPC.permissionAccessibilityOpen, () =>
    openAccessibilityPermissionSettings(),
  );

  ipcMain.handle(IPC.dataDeleteAll, () => deleteAll());
  ipcMain.handle(IPC.dataStorageSizeGet, () => getLocalStorageSize());

  ipcMain.handle(IPC.authSignIn, () => signInWithGoogle());
  ipcMain.handle(IPC.authSignOut, () => authSignOut());
  ipcMain.handle(IPC.authSessionGet, () => getCurrentSession());

  ipcMain.handle(IPC.syncStatusGet, () => getSyncStatus());
  ipcMain.handle(IPC.syncFlushNow, () => flushNow());
  ipcMain.handle(IPC.syncRetryFailed, () => retryFailed());

  ipcMain.handle(IPC.billingPlanGet, () => getPlan());
  ipcMain.handle(IPC.billingCheckout, () => openCheckout());
  ipcMain.handle(IPC.billingPortal, () => openPortal());

  ipcMain.handle(IPC.devReplayLoggingGet, () => isReplayLoggingEnabled());
  ipcMain.handle(IPC.devReplayLoggingSet, (_e, enabled: boolean) =>
    setReplayLoggingEnabled(enabled),
  );

  ipcMain.handle(IPC.processLogsGet, () => getLogBuffer());
}

function sendToAllWindows(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function broadcast<T>(
  channel: string,
  subscribe: (cb: (value: T) => void) => () => void,
): () => void {
  return subscribe((value) => sendToAllWindows(channel, value));
}

export function broadcastAutomationUpdates(automation: Automation) {
  let lastSettings: Settings | null = null;
  let lastStatus: CaptureStatus | null = null;
  return automation.subscribe((state) => {
    if (!lastSettings || !settingsEqual(lastSettings, state.settings)) {
      lastSettings = state.settings;
      sendToAllWindows(IPC.settingsUpdate, state.settings);
    }
    if (!lastStatus || !statusEqual(lastStatus, state.status)) {
      lastStatus = state.status;
      sendToAllWindows(IPC.statusUpdate, state.status);
    }
  });
}

export function broadcastSessionUpdates() {
  return broadcast(IPC.authSessionUpdate, onSessionChange);
}

export function broadcastSyncUpdates() {
  return broadcast(IPC.syncStatusUpdate, onSyncStatusChange);
}

export function broadcastPlanUpdates() {
  return broadcast(IPC.billingPlanUpdate, onPlanChange);
}

export function broadcastLogUpdates() {
  return broadcast(IPC.processLogsUpdate, onLogEntry);
}

export function broadcastSampleUpdates() {
  return broadcast(IPC.samplesInserted, onSampleInserted);
}
