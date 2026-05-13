import { describe, expect, test } from 'vitest';
import {
  buildClassifyUserMessage,
  buildTaxonomyUserMessage,
  CLASSIFY_SYSTEM_PROMPT,
  TAXONOMY_SYSTEM_PROMPT,
} from './prompts';
import type { PromptSegment, Taxonomy } from './types';

const taxonomy: Taxonomy = {
  categories: [
    {
      name: 'Working on slowblink',
      subcategories: ['Coding', 'Designing UI'],
    },
    {
      name: 'Entertainment',
      subcategories: ['Watching YouTube'],
    },
  ],
};

const segments: PromptSegment[] = [
  {
    app: 'Cursor',
    window: 'segmenter.ts — slowblink',
    durationMs: 1_820_000,
    activities: [
      'Editing segmenter.ts',
      'Running pnpm test',
      'Editing segmenter.ts',
    ],
  },
  {
    app: 'Brave Browser',
    window: 'YouTube',
    durationMs: 600_000,
    activities: ['Watching cat compilation video'],
  },
];

describe('system prompts', () => {
  test('TAXONOMY_SYSTEM_PROMPT mentions key fields', () => {
    expect(TAXONOMY_SYSTEM_PROMPT).toContain('Category');
    expect(TAXONOMY_SYSTEM_PROMPT).toContain('Subcategory');
    expect(TAXONOMY_SYSTEM_PROMPT).toContain('existing_taxonomy');
    expect(TAXONOMY_SYSTEM_PROMPT).toContain('new_categories');
    expect(TAXONOMY_SYSTEM_PROMPT).toContain('new_subcategories');
  });

  test('CLASSIFY_SYSTEM_PROMPT instructs the "prefer Other over wrong guess" rule', () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('null');
    expect(CLASSIFY_SYSTEM_PROMPT.toLowerCase()).toContain('other');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('confidence');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('same length');
  });
});

describe('buildTaxonomyUserMessage', () => {
  test('serializes existing taxonomy and segments deterministically', () => {
    const msg = buildTaxonomyUserMessage(taxonomy, segments);
    expect(msg).toMatchInlineSnapshot(`
      "existing_taxonomy:
        - category: 'Working on slowblink'
          subcategories:
            - 'Coding'
            - 'Designing UI'
        - category: 'Entertainment'
          subcategories:
            - 'Watching YouTube'
      segments:
        - app: 'Cursor'
          window: 'segmenter.ts — slowblink'
          durationMs: 1820000
          activities:
            - 'Editing segmenter.ts'
            - 'Running pnpm test'
        - app: 'Brave Browser'
          window: 'YouTube'
          durationMs: 600000
          activities:
            - 'Watching cat compilation video'"
    `);
  });

  test('serializes empty taxonomy as []', () => {
    const msg = buildTaxonomyUserMessage(null, segments.slice(0, 1));
    expect(msg).toContain('existing_taxonomy:[]');
  });

  test('null app/window emit literal null (not quoted)', () => {
    const msg = buildTaxonomyUserMessage(null, [
      {
        app: null,
        window: null,
        durationMs: 1000,
        activities: ['a'],
      },
    ]);
    expect(msg).toContain('- app: null');
    expect(msg).toContain('window: null');
  });

  test('escapes single quotes in app/window/activity strings', () => {
    const msg = buildTaxonomyUserMessage(null, [
      {
        app: "Notes' app",
        window: "user's window 'name'",
        durationMs: 1000,
        activities: ["it's working"],
      },
    ]);
    // YAML single-quoted strings escape ' as ''.
    expect(msg).toContain("'Notes'' app'");
    expect(msg).toContain("'user''s window ''name'''");
    expect(msg).toContain("'it''s working'");
  });
});

describe('buildClassifyUserMessage', () => {
  test('emits taxonomy block first, then segments', () => {
    const msg = buildClassifyUserMessage(taxonomy, segments);
    const taxonomyIdx = msg.indexOf('taxonomy:');
    const segmentsIdx = msg.indexOf('segments:');
    expect(taxonomyIdx).toBeGreaterThanOrEqual(0);
    expect(segmentsIdx).toBeGreaterThan(taxonomyIdx);
  });

  test('activities are deduplicated and sorted', () => {
    const msg = buildClassifyUserMessage(taxonomy, [
      {
        app: 'Cursor',
        window: 'a',
        durationMs: 1,
        activities: ['b', 'a', 'b', 'c'],
      },
    ]);
    // Sorted, deduplicated.
    expect(msg).toMatch(/activities:\n\s+- 'a'\n\s+- 'b'\n\s+- 'c'/);
  });

  test('activities: [] when none after filtering', () => {
    const msg = buildClassifyUserMessage(taxonomy, [
      {
        app: 'Cursor',
        window: 'a',
        durationMs: 1,
        activities: ['', '   '],
      },
    ]);
    expect(msg).toContain('activities: []');
  });

  test('long window title is truncated', () => {
    const longWindow = 'x'.repeat(500);
    const msg = buildClassifyUserMessage(taxonomy, [
      {
        app: 'Cursor',
        window: longWindow,
        durationMs: 1,
        activities: [],
      },
    ]);
    // The truncated form ends with an ellipsis character before the closing
    // single quote.
    expect(msg).toContain("…'");
    expect(msg).not.toContain('x'.repeat(500));
  });

  test('durationMs is rounded to an integer', () => {
    const msg = buildClassifyUserMessage(taxonomy, [
      {
        app: 'Cursor',
        window: 'a',
        durationMs: 1234.7,
        activities: ['x'],
      },
    ]);
    expect(msg).toContain('durationMs: 1235');
  });
});
