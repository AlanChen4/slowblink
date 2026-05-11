import { execFile } from 'node:child_process';
import { desktopCapturer, screen } from 'electron';
import type { WindowContext } from '../../shared/types';
import { logger } from '../logger';

const EMPTY: WindowContext = {
  focusedApp: null,
  focusedWindow: null,
  openWindows: [],
};

// Node timeout must be larger than the AppleScript `with timeout` below so
// AppleScript can report its own timeout cleanly instead of being SIGTERM'd.
const NODE_TIMEOUT_MS = 8000;

// Delimit with unit/record separator control chars so any embedded tabs or
// newlines in window titles can't corrupt the framing.
const FIELD = '\x1f'; // Unit Separator
const RECORD = '\x1e'; // Record Separator

// Output format (one record per RECORD byte):
//   FOCUS<FS>app<FS>title
//   WIN<FS>app<FS>title
//   ERR<FS>where<FS>message    (emitted on AppleScript errors)
//
// Uses a per-process loop wrapped in try/on-error so a single stuck app
// can't kill the whole enumeration. `windows of procList` (a batched
// form) is NOT valid AppleScript — the loop is the correct pattern.
const SCRIPT = `
with timeout of 6 seconds
  tell application "System Events"
    set out to ""
    set fieldSep to (ASCII character 31)
    set recSep to (ASCII character 30)
    try
      set frontProc to first application process whose frontmost is true
      set frontName to name of frontProc
      set frontTitle to ""
      try
        set frontTitle to name of front window of frontProc
      end try
      set out to "FOCUS" & fieldSep & frontName & fieldSep & frontTitle & recSep
    on error errMsg
      set out to out & "ERR" & fieldSep & "focus" & fieldSep & errMsg & recSep
    end try
    try
      set procList to every application process whose background only is false
      repeat with p in procList
        try
          set pname to name of p
          set wList to every window of p
          repeat with w in wList
            set wtitle to ""
            try
              set wtitle to name of w
            end try
            if wtitle is missing value then set wtitle to ""
            set out to out & "WIN" & fieldSep & pname & fieldSep & (wtitle as text) & recSep
          end repeat
        on error errMsg
          set out to out & "ERR" & fieldSep & "proc" & fieldSep & errMsg & recSep
        end try
      end repeat
    on error errMsg
      set out to out & "ERR" & fieldSep & "outer" & fieldSep & errMsg & recSep
    end try
    return out
  end tell
end timeout
`;

interface RawResult {
  stdout: string;
  stderr: string;
}

async function getWindowContext(): Promise<WindowContext> {
  if (process.platform !== 'darwin') return EMPTY;
  const started = Date.now();
  try {
    const { stdout, stderr } = await runOsascript();
    return processOsascriptOutput(stdout, stderr, Date.now() - started);
  } catch (err) {
    logOsascriptFailure(err, Date.now() - started);
    return EMPTY;
  }
}

function processOsascriptOutput(
  stdout: string,
  stderr: string,
  elapsed: number,
): WindowContext {
  if (stderr?.trim()) {
    logger.log('[window-context] osascript stderr:', stderr.trim());
  }
  const { ctx, errors } = parse(stdout);
  for (const e of errors) {
    logger.log(`[window-context] AppleScript error (${e.where}): ${e.msg}`);
  }
  logger.log(
    `[window-context] focused=${ctx.focusedApp ?? 'null'} windows=${ctx.openWindows.length} (${elapsed}ms, stdout=${stdout.length}b)`,
  );
  if (ctx.openWindows.length === 0 && errors.length === 0) {
    logger.log(
      '[window-context] empty openWindows list — likely missing Accessibility permission. Grant it in Settings → Permissions.',
    );
  }
  return ctx;
}

function logOsascriptFailure(err: unknown, elapsed: number): void {
  const isKilled =
    !!err &&
    typeof err === 'object' &&
    'killed' in err &&
    (err as { killed?: boolean }).killed === true;
  if (isKilled) {
    logger.log(
      `[window-context] osascript timed out after ${elapsed}ms — check Accessibility + Automation (System Events) permissions.`,
    );
  } else {
    logger.log(`[window-context] failed after ${elapsed}ms:`, err);
  }
}

function runOsascript(): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'osascript',
      ['-e', SCRIPT],
      { timeout: NODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      },
    );
    child.on('error', reject);
  });
}

interface ParseResult {
  ctx: WindowContext;
  errors: { where: string; msg: string }[];
}

function parse(stdout: string): ParseResult {
  const ctx: WindowContext = {
    focusedApp: null,
    focusedWindow: null,
    openWindows: [],
  };
  const errors: { where: string; msg: string }[] = [];
  for (const record of stdout.split(RECORD)) {
    const parts = splitRecord(record);
    if (!parts) continue;
    applyTag(parts, ctx, errors);
  }
  return { ctx, errors };
}

function splitRecord(record: string): string[] | null {
  if (!record) return null;
  const trimmed = record.replace(/^[\r\n]+/, '');
  if (!trimmed) return null;
  return trimmed.split(FIELD);
}

function applyTag(
  parts: string[],
  ctx: WindowContext,
  errors: { where: string; msg: string }[],
): void {
  const tag = parts[0];
  const a = (parts[1] ?? '').trim();
  const b = (parts[2] ?? '').trim();
  if (tag === 'FOCUS' && a) {
    ctx.focusedApp = a;
    ctx.focusedWindow = b || null;
  } else if (tag === 'WIN' && a) {
    ctx.openWindows.push({ app: a, title: b });
  } else if (tag === 'ERR') {
    errors.push({ where: a, msg: b });
  }
}

export async function takeScreenshot(): Promise<{
  image: Buffer;
  windowCtx: WindowContext;
}> {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const target = fitWithin(width, height, 1280, 800);
  const [sources, windowCtx] = await Promise.all([
    desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: target,
    }),
    getWindowContext(),
  ]);
  let primary = sources[0];
  if (!primary) throw new Error('No screen source available');
  // The first desktopCapturer call after a period of inactivity (e.g. after
  // unpausing) often returns an empty thumbnail while macOS spins up
  // ScreenCaptureKit.  Retry with increasing delays before giving up.
  const RETRY_DELAYS_MS = [300, 600, 1200];
  if (primary.thumbnail.isEmpty()) {
    for (const delay of RETRY_DELAYS_MS) {
      logger.log(`[capture] empty thumbnail, retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
      const retry = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: target,
      });
      primary = retry[0] ?? primary;
      if (!primary.thumbnail.isEmpty()) break;
    }
  }
  if (primary.thumbnail.isEmpty()) {
    throw new Error(
      'Screen capture returned an empty image after retries — macOS may still be initializing the capture subsystem',
    );
  }
  return { image: primary.thumbnail.toJPEG(70), windowCtx };
}

function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
