import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import { registerProtocolHandler } from './auth/deep-link';
import {
  getCurrentSession,
  loadSessionFromDisk,
  onSessionChange,
} from './auth/session';
import type { Automation, AutomationState } from './automation';
import { createAutomation } from './automation';
import { runCaptureTick } from './automation/runner';
import { getPlan, initPlanCache, onPlanChange } from './billing/plan-cache';
import { initDb } from './db';
import { getDevDockIcon } from './dock-icon';
import {
  broadcastAutomationUpdates,
  broadcastPlanUpdates,
  broadcastSampleUpdates,
  broadcastSessionUpdates,
  broadcastSyncUpdates,
  registerIpc,
} from './ipc';
import {
  hasAccessibilityPermission,
  hasScreenPermission,
  onPermissionsChange,
} from './permissions';
import {
  type ControlServer,
  createControlServer,
} from './replay/control-server';
import {
  apiKeyHint,
  apiKeySource,
  getApiKey,
  getStoredSettings,
  hasApiKey,
  initSettings,
  onStoredSettingsChange,
  setStoredSettings,
} from './settings';
import { initSync } from './sync/flusher';

// Open the Chrome DevTools Protocol port in dev so agent-browser (and any
// other CDP client) can attach for E2E checks. Skipped in packaged builds.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

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

function trayStatusLabel(state: AutomationState): string {
  if (state.settings.paused) return 'paused';
  if (state.status.running) return 'running';
  return 'idle';
}

function trayTitle(state: AutomationState): string {
  if (!state.status.hasPermission || !state.status.hasApiKey) return '●!';
  if (state.settings.paused) return '◌';
  return '●';
}

function buildTrayMenu(state: AutomationState, automation: Automation) {
  return Menu.buildFromTemplate([
    {
      label: `slowblink — ${trayStatusLabel(state)}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: state.settings.paused ? 'Resume capture' : 'Pause capture',
      click: () => automation.applyIntent({ paused: !state.settings.paused }),
    },
    { label: 'Open slowblink…', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

function refreshTray(state: AutomationState, automation: Automation) {
  if (!tray) return;
  tray.setTitle(trayTitle(state));
  tray.setToolTip(`slowblink — ${trayStatusLabel(state)}`);
  tray.setContextMenu(buildTrayMenu(state, automation));
}

const disposers: (() => void)[] = [];
let automation: Automation | null = null;
let controlServer: ControlServer | null = null;

registerProtocolHandler();

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    devDockIcon = getDevDockIcon();
    applyDevDockIcon();
    app.dock?.hide();
  }
  await initSettings();
  initDb();

  automation = createAutomation({
    store: {
      get: getStoredSettings,
      set: (patch) => {
        setStoredSettings(patch);
      },
      onChange: (cb) => onStoredSettingsChange(() => cb()),
      hasApiKey,
      apiKeySource,
      apiKeyHint,
      getApiKey,
    },
    session: {
      get: getCurrentSession,
      on: (cb) => onSessionChange(() => cb()),
    },
    plan: {
      get: getPlan,
      on: (cb) => onPlanChange(() => cb()),
    },
    permissions: {
      hasScreen: hasScreenPermission,
      hasAccessibility: hasAccessibilityPermission,
      on: (cb) => onPermissionsChange(() => cb()),
    },
    runner: runCaptureTick,
  });

  registerIpc(automation);
  disposers.push(broadcastAutomationUpdates(automation));
  disposers.push(broadcastSessionUpdates());
  disposers.push(broadcastSyncUpdates());
  disposers.push(broadcastPlanUpdates());
  disposers.push(broadcastSampleUpdates());

  initSync();
  initPlanCache();
  void loadSessionFromDisk();

  tray = new Tray(nativeImage.createEmpty());
  refreshTray(automation.getState(), automation);
  tray.on('click', () => createWindow());

  disposers.push(
    automation.subscribe((state) => {
      if (automation) refreshTray(state, automation);
    }),
  );

  automation.start();

  controlServer = createControlServer({ automation });
  controlServer.start();

  createWindow();
});

app.on('before-quit', () => {
  automation?.stop();
  void controlServer?.stop();
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
