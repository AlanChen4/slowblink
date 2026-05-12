import { execFile } from 'node:child_process';

export const OSASCRIPT_TIMEOUT_MS = 8000;

export interface OsascriptResult {
  stdout: string;
  stderr: string;
}

export function runOsascript(script: string): Promise<OsascriptResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', script],
      { timeout: OSASCRIPT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      },
    );
  });
}
