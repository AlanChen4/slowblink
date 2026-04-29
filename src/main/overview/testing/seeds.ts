import type { Sample } from '../../../shared/types';
import { DLP_BLOCKED_ACTIVITY } from '../../ai/types';

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_START = new Date('2026-04-23T09:00:00.000Z').getTime();

interface Step {
  app: string | null;
  window: string | null;
  activities: string[];
  durationMs: number;
}

function buildSamplesFromSteps(steps: Step[], startTs: number): Sample[] {
  const samples: Sample[] = [];
  let ts = startTs;
  let nextId = 1;
  for (const step of steps) {
    const sampleCount = Math.max(
      1,
      Math.round(step.durationMs / DEFAULT_INTERVAL_MS),
    );
    for (let i = 0; i < sampleCount; i++) {
      const activity = step.activities[i % step.activities.length];
      samples.push({
        id: nextId++,
        ts,
        activity,
        confidence: 0.9,
        focusedApp: step.app,
        focusedWindow: step.window,
      });
      ts += DEFAULT_INTERVAL_MS;
    }
  }
  return samples;
}

export function seedCodingDay(opts?: {
  start?: number;
  hours?: number;
}): Sample[] {
  const start = opts?.start ?? DEFAULT_START;
  const hours = opts?.hours ?? 8;
  const step: Step = {
    app: 'Cursor',
    window: 'segmenter.ts — slowblink',
    activities: [
      'Editing segmenter.ts in Cursor',
      'Running vitest segmenter.test.ts',
      'Debugging a failing rule-1 test',
      'Fixing the import path in fingerprint.ts',
      'Reviewing the diff before commit',
    ],
    durationMs: hours * 60 * 60_000,
  };
  return buildSamplesFromSteps([step], start);
}

export function seedMixedDay(): Sample[] {
  const steps: Step[] = [
    {
      app: 'Cursor',
      window: 'segmenter.ts — slowblink',
      activities: ['Editing segmenter.ts', 'Running tests', 'Reading diff'],
      durationMs: 90 * 60_000,
    },
    {
      app: 'Slack',
      window: '#engineering — slowblink',
      activities: ['Reading #engineering', 'Replying to a thread'],
      durationMs: 15 * 60_000,
    },
    {
      app: 'Cursor',
      window: 'segmenter.ts — slowblink',
      activities: ['Editing segmenter.ts', 'Running tests'],
      durationMs: 60 * 60_000,
    },
    {
      app: 'Brave Browser',
      window: 'Inbox — Gmail — Brave',
      activities: ['Reading a Gmail thread', 'Drafting a reply'],
      durationMs: 20 * 60_000,
    },
    {
      app: 'YouTube',
      window: 'YouTube — Brave',
      activities: ['Watching a conference talk'],
      durationMs: 30 * 60_000,
    },
  ];
  return buildSamplesFromSteps(steps, DEFAULT_START);
}

export function seedBrowserHeavyDay(): Sample[] {
  const steps: Step[] = [
    {
      app: 'Brave Browser',
      window: 'Stripe Dashboard — Brave',
      activities: [
        'Viewing Stripe dashboard overview metrics for the last 7 days',
        'Reviewing payouts and gross/net volume',
        'Checking a recent payment',
      ],
      durationMs: 25 * 60_000,
    },
    {
      app: 'Brave Browser',
      window: '(3) Inbox — Gmail — Brave',
      activities: [
        'Reviewing an email thread about interview scheduling',
        'Drafting a reply confirming interview times',
        'Adding a calendar link to the reply',
      ],
      durationMs: 30 * 60_000,
    },
    {
      app: 'Brave Browser',
      window: 'Patrick Hsu | LinkedIn — Brave',
      activities: [
        'Viewing a LinkedIn profile page for Patrick Hsu',
        "Reading Patrick's experience history",
        'Browsing the Explore Premium profiles sidebar',
      ],
      durationMs: 15 * 60_000,
    },
    {
      app: 'Brave Browser',
      window: 'Apple Developer Program — Brave',
      activities: [
        'Viewing the Apple Developer Program enrollment status page',
        'Confirming the enrollment is being processed',
      ],
      durationMs: 10 * 60_000,
    },
  ];
  return buildSamplesFromSteps(steps, DEFAULT_START);
}

export function seedAudioPlayingFlicker(): Sample[] {
  const samples: Sample[] = [];
  let ts = DEFAULT_START;
  // Alternate between the "Audio playing" and non-"Audio playing" Brave window
  // titles for the same YouTube video. Both should normalize to the same
  // window key and produce a single segment.
  const titles = [
    "I Spent Over 100K on plastic surgeries, so you don't have to (seriously don't) - YouTube - Audio playing - Brave - Lumos Fellows",
    "I Spent Over 100K on plastic surgeries, so you don't have to (seriously don't) - YouTube - Brave - Lumos Fellows",
  ];
  for (let i = 0; i < 30; i++) {
    samples.push({
      id: i + 1,
      ts,
      activity: 'Watching YouTube',
      confidence: 0.9,
      focusedApp: 'Brave Browser',
      focusedWindow: titles[i % titles.length],
    });
    ts += DEFAULT_INTERVAL_MS;
  }
  return samples;
}

export function seedCounterPrefix(): Sample[] {
  const samples: Sample[] = [];
  let ts = DEFAULT_START;
  // Same Gmail tab cycling its unread-count prefix.
  const titles = [
    '(1) Inbox — Gmail — Brave',
    '(2) Inbox — Gmail — Brave',
    'Inbox — Gmail — Brave',
    '(3) Inbox — Gmail — Brave',
  ];
  for (let i = 0; i < 20; i++) {
    samples.push({
      id: i + 1,
      ts,
      activity: 'Reading email',
      confidence: 0.9,
      focusedApp: 'Brave Browser',
      focusedWindow: titles[i % titles.length],
    });
    ts += DEFAULT_INTERVAL_MS;
  }
  return samples;
}

export function seedInterruptionPattern(): Sample[] {
  const steps: Step[] = [
    {
      app: 'Cursor',
      window: 'segmenter.ts — slowblink',
      activities: ['Editing segmenter.ts', 'Running tests'],
      durationMs: 30 * 60_000,
    },
    {
      app: 'Slack',
      window: '#engineering — slowblink',
      activities: ['Replying to a Slack message'],
      durationMs: 60_000,
    },
    {
      app: 'Cursor',
      window: 'segmenter.ts — slowblink',
      activities: ['Editing segmenter.ts', 'Running tests'],
      durationMs: 30 * 60_000,
    },
  ];
  return buildSamplesFromSteps(steps, DEFAULT_START);
}

export function seedIdleGaps(): Sample[] {
  const out: Sample[] = [];
  let id = 1;
  const cluster = (startTs: number, count: number) => {
    for (let i = 0; i < count; i++) {
      out.push({
        id: id++,
        ts: startTs + i * DEFAULT_INTERVAL_MS,
        activity: 'Editing a file in Cursor',
        confidence: 0.9,
        focusedApp: 'Cursor',
        focusedWindow: 'main.ts — slowblink',
      });
    }
  };
  cluster(DEFAULT_START, 10);
  // 3-minute gap (should trigger an idle segment)
  cluster(DEFAULT_START + 10 * DEFAULT_INTERVAL_MS + 3 * 60_000, 10);
  // 2-minute gap
  cluster(
    DEFAULT_START + 20 * DEFAULT_INTERVAL_MS + 3 * 60_000 + 2 * 60_000,
    10,
  );
  return out;
}

export function seedEmpty(): Sample[] {
  return [];
}

export function seedDlpBlocked(): Sample[] {
  const samples: Sample[] = [];
  let ts = DEFAULT_START;
  for (let i = 0; i < 20; i++) {
    const blocked = i % 3 === 0;
    samples.push({
      id: i + 1,
      ts,
      activity: blocked
        ? DLP_BLOCKED_ACTIVITY
        : 'Viewing a sensitive internal dashboard',
      confidence: blocked ? 0 : 0.9,
      focusedApp: 'Brave Browser',
      focusedWindow: 'Internal dashboard — Brave',
    });
    ts += DEFAULT_INTERVAL_MS;
  }
  return samples;
}
