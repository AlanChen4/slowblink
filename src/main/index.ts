import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import type { CaptureStatus, Settings } from '../shared/types';
import { registerProtocolHandler } from './auth/deep-link';
import { loadSessionFromDisk, onSessionChange } from './auth/session';
import { initPlanCache, onPlanChange } from './billing/plan-cache';
import {
  getStatus,
  initCaptureSettingsWatcher,
  onStatusChange,
  startCaptureLoop,
  stopCaptureLoop,
} from './capture';
import { initDb } from './db';
import { getDevDockIcon } from './dock-icon';
import {
  broadcastPlanUpdates,
  broadcastSessionUpdates,
  broadcastSettingsUpdates,
  broadcastStatusUpdates,
  broadcastSyncUpdates,
  registerIpc,
} from './ipc';
import {
  getSettings,
  initSettings,
  onSettingsChange,
  refreshSettings,
  setSettings,
} from './settings';
import { initSync } from './sync/flusher';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let devDockIcon: Electron.NativeImage | null = null;

function applyDevDockIcon() {
  if (devDockIcon) app.dock?.setIcon(devDockIcon);
}

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: 'slowblink',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (process.platform === 'darwin') {
      void app.dock?.show().then(applyDevDockIcon);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (process.platform === 'darwin') app.dock?.hide();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function statusLabel(status: CaptureStatus, settings: Settings): string {
  if (settings.paused) return 'paused';
  if (status.running) return 'running';
  return 'idle';
}

function trayTitle(status: CaptureStatus, settings: Settings): string {
  if (!status.hasPermission || !status.hasApiKey) return '●!';
  if (settings.paused) return '◌';
  return '●';
}

function buildTrayMenu(status: CaptureStatus, settings: Settings) {
  return Menu.buildFromTemplate([
    {
      label: `slowblink — ${statusLabel(status, settings)}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: settings.paused ? 'Resume capture' : 'Pause capture',
      click: () => {
        setSettings({ paused: !settings.paused });
        refreshTray();
      },
    },
    { label: 'Open slowblink…', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

function refreshTray() {
  if (!tray) return;
  const status = getStatus();
  const settings = getSettings();
  tray.setTitle(trayTitle(status, settings));
  tray.setToolTip(`slowblink — ${statusLabel(status, settings)}`);
  tray.setContextMenu(buildTrayMenu(status, settings));
}

const disposers: (() => void)[] = [];

registerProtocolHandler();

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    devDockIcon = getDevDockIcon();
    applyDevDockIcon();
    app.dock?.hide();
  }
  await initSettings();
  initDb();
  registerIpc();
  disposers.push(broadcastStatusUpdates());
  disposers.push(broadcastSettingsUpdates());
  disposers.push(broadcastSessionUpdates());
  disposers.push(broadcastSyncUpdates());
  disposers.push(broadcastPlanUpdates());
  disposers.push(initCaptureSettingsWatcher());
  disposers.push(onSessionChange(refreshSettings));
  disposers.push(onPlanChange(refreshSettings));

  initSync();
  initPlanCache();
  void loadSessionFromDisk();

  tray = new Tray(nativeImage.createEmpty());
  refreshTray();
  tray.on('click', () => createWindow());

  disposers.push(onStatusChange(() => refreshTray()));
  disposers.push(onSettingsChange(() => refreshTray()));

  const settings = getSettings();
  const canCapture = settings.aiMode === 'cloud-ai' || settings.hasApiKey;
  if (!settings.paused && canCapture) startCaptureLoop();

  createWindow();
});

app.on('before-quit', () => {
  stopCaptureLoop();
  while (disposers.length) {
    const dispose = disposers.pop();
    try {
      dispose?.();
    } catch (err) {
      console.log('[shutdown] disposer threw:', err);
    }
  }
});

app.on('window-all-closed', () => {
  // Keep app running in background (menu bar app); do nothing.
});
