import { app, BrowserWindow } from 'electron';
import { completeOAuthCallback } from './session';

export const PROTOCOL = 'slowblink';
const AUTH_CALLBACK_HOST = 'auth';

function focusMainWindow() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function handleUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    console.log('[deep-link] not a parseable url, ignoring');
    return;
  }
  // Avoid logging the full URL — the search params include the single-use
  // OAuth code.
  console.log('[deep-link] received:', `${url.protocol}//${url.host}${url.pathname}`);
  if (url.protocol !== `${PROTOCOL}:`) {
    console.log('[deep-link] wrong protocol, ignoring:', url.protocol);
    return;
  }
  if (url.host !== AUTH_CALLBACK_HOST) {
    console.log('[deep-link] wrong host, ignoring:', url.host);
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    const error = url.searchParams.get('error');
    const description = url.searchParams.get('error_description');
    console.log('[deep-link] no code in callback:', { error, description });
    return;
  }
  try {
    await completeOAuthCallback(code);
    console.log('[deep-link] session established');
    focusMainWindow();
  } catch (err) {
    console.log('[deep-link] auth callback failed:', err);
  }
}

export function registerProtocolHandler() {
  if (process.defaultApp) {
    // Dev mode: Electron.app is launched via `electron .`, so protocol
    // registration requires the original argv to re-spawn correctly.
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1],
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  // macOS: custom protocol arrives via 'open-url'.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    void handleUrl(url);
  });

  // Win/Linux: arrives as a command-line argument on a second instance.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', (_event, argv) => {
    const urlArg = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (urlArg) void handleUrl(urlArg);
    focusMainWindow();
  });
}
