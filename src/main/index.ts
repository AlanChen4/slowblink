import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import type { CaptureStatus } from '../shared/types';
import {
  getStatus,
  initCaptureSettingsWatcher,
  onStatusChange,
  startCaptureLoop,
  stopCaptureLoop,
} from './capture';
import { initDb } from './db';
import {
  broadcastSettingsUpdates,
  broadcastStatusUpdates,
  registerIpc,
} from './ipc';
import { getSettings, initSettings, setSettings } from './settings';
import { initAutoUpdater } from './updater';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

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
    if (process.platform === 'darwin') void app.dock?.show();
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

function statusLabel(s: CaptureStatus): string {
  if (s.paused) return 'paused';
  if (s.running) return 'running';
  return 'idle';
}

function trayTitle(s: CaptureStatus): string {
  if (!s.hasPermission || !s.hasApiKey) return '●!';
  if (s.paused) return '◌';
  return '●';
}

function buildTrayMenu(status: CaptureStatus) {
  return Menu.buildFromTemplate([
    {
      label: `slowblink — ${statusLabel(status)}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: status.paused ? 'Resume capture' : 'Pause capture',
      click: () => {
        setSettings({ paused: !status.paused });
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
  const s = getStatus();
  tray.setTitle(trayTitle(s));
  tray.setToolTip(`slowblink — ${statusLabel(s)}`);
  tray.setContextMenu(buildTrayMenu(s));
}

const disposers: (() => void)[] = [];

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.hide();
  await initSettings();
  initDb();
  registerIpc();
  disposers.push(broadcastStatusUpdates());
  disposers.push(broadcastSettingsUpdates());
  disposers.push(initCaptureSettingsWatcher());

  tray = new Tray(nativeImage.createEmpty());
  refreshTray();
  tray.on('click', () => createWindow());

  disposers.push(onStatusChange(() => refreshTray()));

  const { paused } = getSettings();
  if (!paused) startCaptureLoop();

  initAutoUpdater();
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
