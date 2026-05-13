// Pre-processes a fixture into a labeling-friendly JSON file. Used to bootstrap
// ground-truth labels for eval — the LLM/human labels these pre-shaped
// segments without re-running the segmenter.
//
//   pnpm exec tsx scripts/eval/dump-segments.ts 2026-04-23 > /tmp/segments.json

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DLP_BLOCKED_ACTIVITY } from '../../src/main/ai/types';
import { samplesToSegments } from '../../src/shared/overview/segmenter';
import { segmentHash } from '../../src/main/ai/classification/hash';
import { loadFixtureSamples } from '../../src/main/ai/classification/testing/fixtures';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');

function attachActivities(
  segments: ReturnType<typeof samplesToSegments>,
  samples: ReturnType<typeof loadFixtureSamples>,
) {
  const out: {
    segmentHash: string;
    focusedApp: string | null;
    focusedWindow: string | null;
    durationMs: number;
    activities: string[];
  }[] = [];
  let cursor = 0;
  for (const seg of segments) {
    if (seg.focusedApp === null) continue;
    const activities = new Set<string>();
    while (cursor < samples.length && samples[cursor].ts < seg.startTs)
      cursor++;
    let scan = cursor;
    while (scan < samples.length && samples[scan].ts < seg.endTs) {
      const s = samples[scan];
      if (s.activity && s.activity !== DLP_BLOCKED_ACTIVITY)
        activities.add(s.activity);
      scan++;
    }
    const list = [...activities];
    out.push({
      segmentHash: segmentHash(seg, list),
      focusedApp: seg.focusedApp,
      focusedWindow: seg.focusedWindow,
      durationMs: seg.durationMs,
      activities: list,
    });
  }
  return out;
}

function main() {
  const date = process.argv[2] ?? '2026-04-23';
  const fixturePath = resolve(REPO_ROOT, `fixtures/samples-${date}.json`);
  const samples = loadFixtureSamples(fixturePath);
  const segments = samplesToSegments(samples);
  const enriched = attachActivities(segments, samples);
  const totalMs = enriched.reduce((acc, s) => acc + s.durationMs, 0);
  process.stderr.write(
    `Loaded ${samples.length} samples → ${segments.length} segments → ${enriched.length} labeled (total ${Math.round(totalMs / 60_000)}min)\n`,
  );
  process.stdout.write(JSON.stringify(enriched, null, 2));
}

main();
