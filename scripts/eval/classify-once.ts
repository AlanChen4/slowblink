// One-shot manual verification script for the classification pipeline.
//
//   pnpm exec tsx scripts/eval/classify-once.ts [fixture-date]
//
// Defaults to 2026-04-23 (the eval fixture). Requires OPENAI_API_KEY in env
// (use `doppler run -- pnpm exec tsx ...` when .doppler.yaml is present).

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySegments } from '../../src/main/ai/classification';
import { loadFixtureSamples } from '../../src/main/ai/classification/testing/fixtures';
import {
  DEFAULT_CLASSIFICATION_CONFIG,
  type Classification,
  type Taxonomy,
} from '../../src/main/ai/classification/types';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = resolve(__filename, '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

function loadLabelsTaxonomy(date: string): Taxonomy | null {
  const labelsPath = resolve(
    REPO_ROOT,
    `eval/classification/labels-samples-${date}.json`,
  );
  try {
    const { readFileSync } = require('node:fs');
    const data = JSON.parse(readFileSync(labelsPath, 'utf8'));
    if (data?.taxonomy?.categories) return data.taxonomy as Taxonomy;
  } catch {
    // Labels not yet present — that's fine, Pass 1 will build a Taxonomy.
  }
  return null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Summary {
  category: string;
  subcategory: string;
  durationMs: number;
}

function summarize(
  classifications: Classification[],
  durations: Map<string, number>,
): Summary[] {
  const buckets = new Map<string, number>();
  for (const c of classifications) {
    const key =
      c.category && c.subcategory
        ? `${c.category}|${c.subcategory}`
        : 'Other|Other';
    const dur = durations.get(c.segmentHash) ?? 0;
    buckets.set(key, (buckets.get(key) ?? 0) + dur);
  }
  return [...buckets.entries()]
    .map(([key, durationMs]) => {
      const [category, subcategory] = key.split('|');
      return { category, subcategory, durationMs };
    })
    .toSorted((a, b) => b.durationMs - a.durationMs);
}

async function main() {
  const date = process.argv[2] ?? '2026-04-23';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY missing. Set via Doppler or .env.local.');
    process.exit(2);
  }

  const fixturePath = resolve(REPO_ROOT, `fixtures/samples-${date}.json`);
  console.error(`Loading fixture: ${fixturePath}`);
  const samples = loadFixtureSamples(fixturePath);
  console.error(`  ${samples.length} samples loaded`);

  const seedTaxonomy = loadLabelsTaxonomy(date);
  if (seedTaxonomy) {
    console.error(
      `  Seeded ${seedTaxonomy.categories.length} categories from labels`,
    );
  }

  const startedAt = Date.now();
  const result = await classifySegments({
    samples,
    existingTaxonomy: seedTaxonomy,
    config: {
      ...DEFAULT_CLASSIFICATION_CONFIG,
      apiKey,
      aiMode: 'byo-key',
    },
  });
  const elapsedMs = Date.now() - startedAt;

  const durations = new Map<string, number>();
  for (const seg of result.enrichedSegments) {
    const { segmentHash } =
      await import('../../src/main/ai/classification/hash');
    durations.set(segmentHash(seg, seg.activities), seg.durationMs);
  }

  const summary = summarize(result.classifications, durations);
  console.log('\n=== Taxonomy ===');
  for (const cat of result.taxonomy.categories) {
    console.log(`- ${cat.name}`);
    for (const sub of cat.subcategories) console.log(`  · ${sub}`);
  }

  console.log('\n=== Time by Subcategory ===');
  for (const row of summary) {
    console.log(
      `${formatDuration(row.durationMs).padStart(8)}  ${row.subcategory} (${row.category})`,
    );
  }

  console.log(
    `\nClassified ${result.classifications.length} segments in ${formatDuration(elapsedMs)}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
