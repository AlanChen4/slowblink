import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolve the local Electron app's SQLite DB path. Mirrors what
 * Electron's `app.getPath('userData')` would return so dev scripts
 * can read/write the same file the running app uses.
 */
export function resolveDbPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'slowblink',
      'slowblink.db',
    );
  }
  if (platform === 'win32') {
    const appData =
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'slowblink', 'slowblink.db');
  }
  return join(homedir(), '.config', 'slowblink', 'slowblink.db');
}
