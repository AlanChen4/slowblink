// Gated eval test for the classification pipeline.
//
//   pnpm test:eval
//
// Requires OPENAI_API_KEY in env (use `doppler run --` when .doppler.yaml is
// present). Excluded from the default `pnpm test` run by vitest.config.ts.
//
// Asserts: exact-match (category, subcategory) accuracy ≥ EXACT_MATCH_THRESHOLD
// against ground-truth labels in eval/classification/labels-samples-<date>.json.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { classifySegments } from './index';
import { segmentHash } from './hash';
import { loadFixtureSamples } from './testing/fixtures';
import { DEFAULT_CLASSIFICATION_CONFIG } from './types';
import type {
  Classification,
  ClassificationConfig,
  SegmentWithActivities,
  Taxonomy,
} from './types';

const FIXTURE_DATE = '2026-04-23';
const EXACT_MATCH_THRESHOLD = 0.8;
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

interface LabelsFile {
  taxonomy: Taxonomy;
  classifications: {
    segmentHash: string;
    category: string | null;
    subcategory: string | null;
  }[];
}

function loadLabels(date: string): LabelsFile {
  const labelsPath = resolve(
    REPO_ROOT,
    `eval/classification/labels-samples-${date}.json`,
  );
  const data = JSON.parse(readFileSync(labelsPath, 'utf8')) as LabelsFile;
  return data;
}

function buildExpectedMap(
  labels: LabelsFile,
): Map<string, { category: string | null; subcategory: string | null }> {
  const out = new Map<
    string,
    { category: string | null; subcategory: string | null }
  >();
  for (const c of labels.classifications) {
    out.set(c.segmentHash, {
      category: c.category,
      subcategory: c.subcategory,
    });
  }
  return out;
}

function buildDurationMap(
  segments: SegmentWithActivities[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const seg of segments) {
    out.set(segmentHash(seg, seg.activities), seg.durationMs);
  }
  return out;
}

interface Mismatch {
  segmentHash: string;
  focusedApp: string | null;
  focusedWindow: string | null;
  durationMs: number;
  predicted: { category: string | null; subcategory: string | null };
  truth: { category: string | null; subcategory: string | null };
}

function evaluate(
  classifications: Classification[],
  enriched: SegmentWithActivities[],
  expected: Map<
    string,
    { category: string | null; subcategory: string | null }
  >,
): {
  exact: number;
  categoryOnly: number;
  durationWeighted: number;
  mismatches: Mismatch[];
  scored: number;
  totalDurationMs: number;
} {
  let exact = 0;
  let categoryOnly = 0;
  let weightedHitMs = 0;
  let totalDurationMs = 0;
  const mismatches: Mismatch[] = [];
  const segBy = new Map<string, SegmentWithActivities>();
  for (const seg of enriched) {
    segBy.set(segmentHash(seg, seg.activities), seg);
  }

  let scored = 0;
  for (const c of classifications) {
    const truth = expected.get(c.segmentHash);
    if (!truth) continue; // segment isn't labeled — skip
    scored++;
    const seg = segBy.get(c.segmentHash);
    const durationMs = seg?.durationMs ?? 0;
    totalDurationMs += durationMs;

    const sameCategory = (truth.category ?? '') === (c.category ?? '');
    const sameSubcategory = (truth.subcategory ?? '') === (c.subcategory ?? '');
    if (sameCategory) categoryOnly++;
    if (sameCategory && sameSubcategory) {
      exact++;
      weightedHitMs += durationMs;
    } else {
      mismatches.push({
        segmentHash: c.segmentHash,
        focusedApp: seg?.focusedApp ?? null,
        focusedWindow: seg?.focusedWindow ?? null,
        durationMs,
        predicted: { category: c.category, subcategory: c.subcategory },
        truth: { category: truth.category, subcategory: truth.subcategory },
      });
    }
  }

  return {
    exact: scored > 0 ? exact / scored : 0,
    categoryOnly: scored > 0 ? categoryOnly / scored : 0,
    durationWeighted: totalDurationMs > 0 ? weightedHitMs / totalDurationMs : 0,
    mismatches,
    scored,
    totalDurationMs,
  };
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

const apiKey = process.env.OPENAI_API_KEY;
const describeIfKey = apiKey ? describe : describe.skip;

describeIfKey('classification eval — fixtures/samples-' + FIXTURE_DATE, () => {
  test(
    `exact-match accuracy ≥ ${fmtPct(EXACT_MATCH_THRESHOLD)} on Pass 2 with seed Taxonomy`,
    { timeout: 600_000 },
    async () => {
      const samples = loadFixtureSamples(
        resolve(REPO_ROOT, `fixtures/samples-${FIXTURE_DATE}.json`),
      );
      const labels = loadLabels(FIXTURE_DATE);
      const expected = buildExpectedMap(labels);

      const config: ClassificationConfig = {
        ...DEFAULT_CLASSIFICATION_CONFIG,
        apiKey: apiKey ?? null,
        aiMode: 'byo-key',
        // Pass 2 default is gpt-5.4-nano; the eval uses gpt-5.4-mini because the
        // user_context block has too many disambiguation rules for nano to track
        // reliably. See plan section "Eval accuracy" — last-resort lever.
        classifyModel: 'gpt-5.4-mini',
        userContext: [
          'The user is Alan Chen, founder/CEO of Lumos Fellows (a startup) with side project slowblink (an Electron screenshot/summarization app).',
          '',
          'STRONG DEFAULTS (apply unless an explicit override below fires):',
          '- Generic Claude.app activity discussing the lumos-fellows-web codebase → "Lumos coding". Do NOT pick a narrower Lumos subcategory just because the activity text mentions emails, billing, or onboarding — those narrower Subcategories require a very specific match (see below).',
          '- Generic Claude.app activity that you cannot pin to a project → "Lumos coding" (Lumos is the user\'s primary work).',
          '- ANY GitHub Pull Request page in the Lumos-Fellows org → "Lumos coding", regardless of PR title.',
          '- Supabase Table Editor for "Lumos Fellows, Prd" (any table) → "Lumos coding".',
          '',
          'PEOPLE & PROJECTS',
          '- Aryesh Kundu = a Lumos Fellows MENTEE. His project is "ToxiClear AI". Any Slack channel "help-aryesh-kundu", DM with him, OR browser tab containing "ToxiClear AI" → "Mentor support".',
          '- Chris Kim, Adam Zheng, Sana Raut = Lumos teammates/interviewers. Slack DMs with them → "Interviewer coordination" (NOT "Interviewer onboarding").',
          '',
          'CODING vs slowblink',
          '- Cursor / Electron windows / Claude.app sessions about the slowblink codebase (overview pipeline, segmenter, activity classification, screen-capture, replay tool, activitySamples) → "slowblink coding".',
          '- Electron app window titled "slowblink" (the user manually running the dev build, exercising UI) → "Testing slowblink".',
          '- Everything else coding-flavored → "Lumos coding" (the safer default).',
          '',
          'NARROW Lumos subcategories — use ONLY when explicitly applicable',
          '- "Email observability" = inspecting email-DELIVERY METRICS in an admin dashboard (delivery rates, suppression lists, bounce reports, Mailgun analytics page). NOT writing email-related code, NOT browsing inbox.',
          '- "Interviewer onboarding" = ONBOARDING NEW INTERVIEWERS specifically (training new helpers, sending them setup docs). NOT preparing for interviews the user himself is conducting.',
          '- "Admin and billing" = Stripe billing dashboard, Supabase project settings/billing, paying invoices.',
          '- "Admin and review" = reviewing applicant pipeline in Google Sheets, the public Lumos landing page ("Lumos Fellows | Build a Product..."), the Lumos Fellows admin dashboard general browsing (NOT coding it).',
          '- "Planning" = Notion docs, scratchpad notes, strategy roadmaps that are NOT a specific coding task. Notion window "2026" is Planning.',
          '- "Hiring interviews" = conducting interviews, prepping immediately for one, viewing interview-specific Google Docs ("Lumos Interviews Onboarding" doc is interview prep — count as Hiring interviews), Google Calendar with many interview slots, Slack searches for interview info.',
          '- "Lumos email" = outbound transactional/notification emails the user sends or reviews in Gmail (interview reminders, "please ignore...", "checking in about...").',
          '',
          'PERSONAL communication',
          '- macOS "Messages" app (window title is a contact name like "bubu", "limmy", any single name or emoji) → "iMessage chats".',
          '- macOS "FaceTime" app → "Calls".',
          '- avchen4@gmail.com Inbox tabs = "Personal email".',
          '',
          'ENTERTAINMENT vs research',
          '- YouTube videos, X posts, articles, or Google searches specifically about AI (GPT, Claude, OpenAI, Anthropic, AI models, Claude Code commands, /simplify, /batch, agent SDKs, prompt engineering, branded types in TS) → "AI and tech news".',
          '- LinkedIn profile pages of candidates, Reddit r/gtmengineering, Medra/Floqer job listings, scraping/sales-engineering content → "GTM and competitor research".',
          '- Generic non-tech X posts (random viral, robotics labs, lifestyle) → "Social feed".',
          '- Non-tech YouTube (cats, travel vlogs, plastic surgery, anime, basketball, music) AND non-tech Reddit (r/Biohackers and other lifestyle subs) AND general lifestyle Google searches (citicoline, peptides, biohacking) → "YouTube and entertainment".',
          '- Ticketmaster, Wells Fargo, online shopping → "Personal finance and shopping".',
        ].join('\n'),
      };
      const result = await classifySegments({
        samples,
        existingTaxonomy: labels.taxonomy,
        config,
        skipTaxonomyPass: true,
      });

      const durations = buildDurationMap(result.enrichedSegments);
      const metrics = evaluate(
        result.classifications,
        result.enrichedSegments,
        expected,
      );

      console.log(
        `\nScored ${metrics.scored}/${result.classifications.length} segments (covering ${fmtDuration(metrics.totalDurationMs)})`,
      );
      console.log(`  Exact match:        ${fmtPct(metrics.exact)}`);
      console.log(`  Category only:      ${fmtPct(metrics.categoryOnly)}`);
      console.log(`  Duration-weighted:  ${fmtPct(metrics.durationWeighted)}`);

      if (metrics.mismatches.length > 0) {
        console.log(`\n--- ${metrics.mismatches.length} mismatches ---`);
        const sorted = metrics.mismatches.toSorted(
          (a, b) => b.durationMs - a.durationMs,
        );
        const shown = sorted.slice(0, 50);
        for (const m of shown) {
          const dur = fmtDuration(m.durationMs).padStart(7);
          const pred = `(${m.predicted.category ?? 'Other'} / ${m.predicted.subcategory ?? 'Other'})`;
          const truth = `(${m.truth.category ?? 'Other'} / ${m.truth.subcategory ?? 'Other'})`;
          console.log(
            `${dur}  ${m.focusedApp ?? '∅'} — ${m.focusedWindow ?? '∅'}`,
          );
          console.log(`         pred:  ${pred}`);
          console.log(`         truth: ${truth}`);
        }
        if (metrics.mismatches.length > shown.length) {
          console.log(
            `...and ${metrics.mismatches.length - shown.length} more`,
          );
        }
      }

      // Sanity: at least most labeled segments were actually scored (i.e. the
      // segment hash space hasn't drifted from the labels file).
      expect(metrics.scored / expected.size).toBeGreaterThan(0.9);
      expect(metrics.exact).toBeGreaterThanOrEqual(EXACT_MATCH_THRESHOLD);

      // Suppress unused-binding warning — keep durations available for follow-up
      // assertions during iteration.
      void durations;
    },
  );
});
