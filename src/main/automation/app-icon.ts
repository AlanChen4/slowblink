import { nativeImage } from 'electron';
import { getAppIcon, upsertAppIcon } from '../db';
import { runOsascript } from './osascript';

const ICON_SIZE = 64;

const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

async function resolveAppPath(appName: string): Promise<string | null> {
  const escaped = appName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `POSIX path of (path to application "${escaped}")`;
  const { stdout } = await runOsascript(script);
  // osascript returns paths with a trailing slash for directories (e.g.
  // "/Applications/Claude.app/"). Electron's app.getFileIcon resolves the
  // trailing-slash form to a generic folder icon instead of the bundle icon,
  // so strip it before passing through.
  const path = stdout.trim().replace(/\/$/, '');
  return path || null;
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
