import type { Sample, Segment } from '../../shared/types';

export const IDLE_GAP_MS = 60_000;

const FALLBACK_INTERVAL_MS = 10_000;

// Status-notification tokens that browsers and other apps inject between the
// page title and the app name, e.g.
//   "Some Video - YouTube - Audio playing - Brave - Lumos Fellows".
// These flicker on/off depending on instantaneous app state and create false-
// unique segments if we treat them as part of the window key.
const STATUS_TOKENS = [
  'Audio playing',
  'Microphone in use',
  'Camera in use',
  'Camera and microphone in use',
  'Recording',
];

// Apps whose window titles end with " - <browser short name>" (and often a
// trailing " - <profile>" after that) — Chromium-family browsers + Safari.
// Map keys are matched against `focusedApp` exactly; values are the dash-
// separated tokens we strip from the END of the window title.
const BROWSER_APP_TO_SUFFIXES: Record<string, string[]> = {
  'Brave Browser': ['Brave Browser', 'Brave'],
  'Google Chrome': ['Google Chrome', 'Chrome'],
  Chromium: ['Chromium'],
  Firefox: ['Firefox'],
  Safari: ['Safari'],
  Arc: ['Arc'],
};

const COUNTER_PREFIX_RE = /^\s*\(\d+\)\s*/;

// A title separator is `-` or `—` surrounded by spaces. Real Brave/Chrome
// titles use a regular hyphen, but app titles sometimes use an em-dash; we
// treat them as equivalent for matching, but preserve whatever separator
// the original string used in the unaffected portions.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeFocusedWindow(
  window: string | null,
  app: string | null,
): string | null {
  if (window === null) return null;
  let s = window.trim().replace(COUNTER_PREFIX_RE, '');

  for (const token of STATUS_TOKENS) {
    // Remove " - <token>" or " — <token>" wherever it appears (with the
    // leading separator), so the surrounding tokens close back up.
    const re = new RegExp(` [-—] ${escapeRegExp(token)}(?= [-—] |$)`, 'g');
    s = s.replace(re, '');
  }

  const browserSuffixes = app ? BROWSER_APP_TO_SUFFIXES[app] : undefined;
  if (browserSuffixes) {
    s = stripTrailingBrowserSuffix(s, browserSuffixes);
  }

  return s.trim();
}

function stripTrailingBrowserSuffix(
  window: string,
  browserNames: string[],
): string {
  for (const name of browserNames) {
    // Match " - Brave" or " - Brave - <profile>" (and em-dash variants) at end.
    const re = new RegExp(` [-—] ${escapeRegExp(name)}(?: [-—] [^-—]+)?$`);
    const next = window.replace(re, '');
    if (next !== window) return next;
  }
  return window;
}

function sameKey(a: Sample, b: Sample): boolean {
  return (
    a.focusedApp === b.focusedApp &&
    normalizeFocusedWindow(a.focusedWindow, a.focusedApp) ===
      normalizeFocusedWindow(b.focusedWindow, b.focusedApp)
  );
}

function medianInterval(samples: Sample[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i].ts - samples[i - 1].ts;
    if (g > 0 && g < IDLE_GAP_MS) gaps.push(g);
  }
  if (gaps.length === 0) return FALLBACK_INTERVAL_MS;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function emitRunSegment(run: Sample[], closingTs: number): Segment {
  const startTs = run[0].ts;
  const endTs = Math.max(startTs, closingTs);
  return {
    startTs,
    endTs,
    durationMs: endTs - startTs,
    focusedApp: run[0].focusedApp,
    focusedWindow: normalizeFocusedWindow(
      run[0].focusedWindow,
      run[0].focusedApp,
    ),
  };
}

function emitIdleSegment(startTs: number, endTs: number): Segment {
  return {
    startTs,
    endTs,
    durationMs: endTs - startTs,
    focusedApp: null,
    focusedWindow: null,
  };
}

export function samplesToSegments(samples: Sample[]): Segment[] {
  if (samples.length === 0) return [];
  const interval = medianInterval(samples);
  const segments: Segment[] = [];
  let run: Sample[] = [samples[0]];

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const gap = curr.ts - prev.ts;

    if (gap > IDLE_GAP_MS) {
      const runEndTs = prev.ts + interval;
      segments.push(emitRunSegment(run, runEndTs));
      if (curr.ts > runEndTs) {
        segments.push(emitIdleSegment(runEndTs, curr.ts));
      }
      run = [curr];
      continue;
    }

    if (!sameKey(prev, curr)) {
      segments.push(emitRunSegment(run, curr.ts));
      run = [curr];
      continue;
    }

    run.push(curr);
  }

  const lastTs = run[run.length - 1].ts;
  segments.push(emitRunSegment(run, lastTs + interval));
  return segments;
}
