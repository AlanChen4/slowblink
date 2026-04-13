import { exec } from 'node:child_process';
import { desktopCapturer, shell, systemPreferences } from 'electron';

const SCREEN_CAPTURE_PREF_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
const ACCESSIBILITY_PREF_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

// Permission status changes only when the user toggles a switch in System
// Settings. Cache briefly so the per-tick getStatus() call doesn't hammer
// native APIs. Cache is invalidated whenever the app prompts for a change.
const PERMISSION_CACHE_TTL_MS = 10_000;
let cachedScreen: { ts: number; value: boolean } | null = null;
let cachedAccessibility: { ts: number; value: boolean } | null = null;

export function hasScreenPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  const now = Date.now();
  if (cachedScreen && now - cachedScreen.ts < PERMISSION_CACHE_TTL_MS) {
    return cachedScreen.value;
  }
  const value = systemPreferences.getMediaAccessStatus('screen') === 'granted';
  cachedScreen = { ts: now, value };
  return value;
}

export function hasAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  const now = Date.now();
  if (
    cachedAccessibility &&
    now - cachedAccessibility.ts < PERMISSION_CACHE_TTL_MS
  ) {
    return cachedAccessibility.value;
  }
  const value = systemPreferences.isTrustedAccessibilityClient(false);
  cachedAccessibility = { ts: now, value };
  return value;
}

export async function requestScreenPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  cachedScreen = null;

  const status = systemPreferences.getMediaAccessStatus('screen');
  console.log('[permissions] requestScreenPermission: status =', status);
  if (status === 'granted') return true;

  // CRITICAL: open System Settings BEFORE touching desktopCapturer.
  // desktopCapturer.getSources can stall on macOS while ScreenCaptureKit
  // negotiates permission, which would block this IPC call indefinitely
  // and the UI would see "nothing happens". Settings must come first.
  await openScreenPermissionSettings();

  // Fire-and-forget a real capture attempt so macOS registers this binary
  // with TCC and it shows up in the Screen Recording list. We deliberately
  // do NOT await this — it can hang on macOS 13+ until the user grants
  // access. The 256x256 thumbnail forces ScreenCaptureKit to actually try
  // to capture (a 1x1 thumbnail gets optimized away and never registers).
  void desktopCapturer
    .getSources({
      types: ['screen'],
      thumbnailSize: { width: 256, height: 256 },
      fetchWindowIcons: false,
    })
    .then(
      () => console.log('[permissions] desktopCapturer.getSources resolved'),
      (err) =>
        console.log('[permissions] desktopCapturer.getSources rejected:', err),
    );

  return false;
}

export async function requestAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  cachedAccessibility = null;
  // Passing true triggers the macOS prompt the first time. On subsequent
  // calls when still untrusted, the prompt is suppressed, so fall back to
  // opening System Settings directly so the user has somewhere to go.
  const granted = systemPreferences.isTrustedAccessibilityClient(true);
  if (!granted) await openAccessibilityPermissionSettings();
  return granted;
}

export function openScreenPermissionSettings(): Promise<void> {
  return openPrefPane(SCREEN_CAPTURE_PREF_URL, 'screen');
}

export function openAccessibilityPermissionSettings(): Promise<void> {
  return openPrefPane(ACCESSIBILITY_PREF_URL, 'accessibility');
}

async function openPrefPane(url: string, label: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  console.log(`[permissions] opening System Settings (${label}):`, url);
  try {
    await shell.openExternal(url);
    console.log('[permissions] shell.openExternal returned');
  } catch (err) {
    console.log('[permissions] shell.openExternal threw, falling back:', err);
    // Fallback: shell.openExternal occasionally drops custom URL schemes in
    // dev. `open` from the command line is the most reliable invocation.
    exec(`open ${JSON.stringify(url)}`, (e) => {
      if (e) console.log('[permissions] open fallback failed:', e);
    });
  }
}
