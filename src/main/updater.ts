import { autoUpdater } from 'electron-updater';

export function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.log('[updater] error:', err.message);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded:', info.version);
  });

  void autoUpdater.checkForUpdatesAndNotify();
}
