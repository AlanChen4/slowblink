import { app, BrowserWindow } from 'electron';
import { refreshPlan } from '../billing/plan-cache';
import { completeOAuthCallback } from './session';

export const PROTOCOL = 'slowblink';

function focusMainWindow() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function handleAuthCallback(url: URL) {
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

// Stripe redirects back via slowblink:// after checkout or portal changes.
// Paths: billing/success (checkout), billing/cancel (checkout aborted),
// settings (portal return). The webhook (stripe-webhook) is the source of
// truth for tier/renews_at; the UI needs a nudge to refetch — without it
// the user sees the old plan until the next session change or app restart.
// We skip refreshing on billing/cancel (nothing server-side changed) and
// schedule a delayed second refresh as a safety net in case the webhook
// lands a beat after the user-visible redirect.
async function handleBillingReturn(shouldRefresh: boolean) {
  focusMainWindow();
  if (!shouldRefresh) return;
  await refreshPlan();
  setTimeout(() => void refreshPlan(), 3000);
}

async function handleUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    console.log('[deep-link] not a parseable url, ignoring');
    return;
  }
  console.log(
    '[deep-link] received:',
    `${url.protocol}//${url.host}${url.pathname}`,
  );
  if (url.protocol !== `${PROTOCOL}:`) {
    console.log('[deep-link] wrong protocol, ignoring:', url.protocol);
    return;
  }
  switch (url.host) {
    case 'auth':
      await handleAuthCallback(url);
      return;
    case 'billing':
      await handleBillingReturn(url.pathname === '/success');
      return;
    case 'settings':
      await handleBillingReturn(true);
      return;
    default:
      console.log('[deep-link] unknown host, ignoring:', url.host);
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
