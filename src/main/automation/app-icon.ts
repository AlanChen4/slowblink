import { execFile } from 'node:child_process';
import { nativeImage } from 'electron';
import { getAppIcon, upsertAppIcon } from '../db';

const ICON_SIZE = 64;

const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const MDFIND_TIMEOUT_MS = 4000;

const sessionNegativeCache = new Set<string>();

export async function resolveAndStoreAppIcon(appName: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (!appName) return;
  if (sessionNegativeCache.has(appName)) return;

  const existing = getAppIcon(appName);
  const now = Date.now();
  if (existing && now - existing.updatedAt < ICON_CACHE_TTL_MS) return;

  try {
    const path = await resolveAppPath(appName);
    if (!path) {
      sessionNegativeCache.add(appName);
      return;
    }
    const dataUrl = await getIconDataUrl(path);
    if (!dataUrl) {
      sessionNegativeCache.add(appName);
      return;
    }
    upsertAppIcon(appName, dataUrl, Date.now());
  } catch (err) {
    sessionNegativeCache.add(appName);
    console.log(`[app-icon] resolve failed for ${appName}:`, err);
  }
}

function resolveAppPath(appName: string): Promise<string | null> {
  // Spotlight rather than osascript's `path to application` because Apple
  // Event sandboxing (Messages, Mail, Contacts) blocks the latter with -1743
  // unless this app holds Automation permission for each target. mdfind
  // needs no permission and reaches the same bundle.
  const escaped = appName.replace(/"/g, '\\"');
  const query = `kMDItemFSName == "${escaped}.app"`;
  return new Promise((resolve) => {
    execFile(
      'mdfind',
      [query],
      { timeout: MDFIND_TIMEOUT_MS, maxBuffer: 1024 * 64 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const first = stdout
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 0);
        resolve(first ?? null);
      },
    );
  });
}

async function getIconDataUrl(appPath: string): Promise<string | null> {
  // app.getFileIcon returns the same generic placeholder for every .app
  // bundle on this Electron version (33.x). nativeImage.createThumbnailFromPath
  // walks the bundle's CFBundleIconFile and produces the actual icon.
  const image = await nativeImage.createThumbnailFromPath(appPath, {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
  if (image.isEmpty()) return null;
  return image.toDataURL();
}
