import type { PromptSegment, Taxonomy } from './types';

const MAX_WINDOW_LEN = 200;
const MAX_ACTIVITY_LEN = 240;

export const TAXONOMY_SYSTEM_PROMPT = `You are organizing a user's screen-activity segments into a hierarchical Taxonomy of (Category, Subcategory) pairs.

A Category is a broad area of work or life (e.g. "Working on slowblink", "Personal communication", "Entertainment").
A Subcategory is a specific activity within that Category (e.g. "Coding", "Designing UI", "Responding to email").

You will receive:
- existing_taxonomy: pairs already in the Taxonomy. Never modify or remove these.
- segments: activity segments the user spent time on, each with an app, window title, durationMs, and a list of activity descriptions captured from screenshots.

Your job: propose ADDITIONS to the Taxonomy so that nearly every segment can be classified into some (Category, Subcategory). Output JSON describing:
- new_categories: brand-new Categories with their initial Subcategories.
- new_subcategories: new Subcategories that belong under a Category that already exists OR under one you just proposed in new_categories.

Rules for good additions:
1. Subcategories should be specific enough that meaningfully different activities don't collapse into one bucket. Prefer "Coding for slowblink" + "Designing slowblink UI" over a single "slowblink work".
2. Categories should be broad enough that several Subcategories fit under each. Don't make a Category just for one Subcategory unless it truly stands alone.
3. Do not duplicate existing entries. Case-insensitive name collisions are not allowed.
4. Names are short, human-readable phrases. No emoji, no quotes, no markdown.
5. If existing_taxonomy already covers every segment well, return empty arrays for both fields. Avoid speculative additions.`;

export const CLASSIFY_SYSTEM_PROMPT = `You classify a user's screen-activity segments into a fixed Taxonomy of (Category, Subcategory) pairs.

You will receive:
- user_context: free-form notes about the user (their work, projects, key contacts). Treat as authoritative — it explains things you cannot infer from window titles alone (e.g. a person's role, what an internal channel name refers to).
- taxonomy: the closed set of valid (Category, Subcategory) pairs.
- segments: activity segments to classify, each with an app, window title, durationMs, and a list of activity descriptions captured from screenshots.

For each segment, output the single best-matching (Category, Subcategory) pair from the taxonomy, OR (null, null) if no pair is a reasonable fit.

Rules:
1. The category MUST exactly match a category name from the taxonomy (case-sensitive). The subcategory MUST exactly match one of that category's subcategories.
2. Either both category and subcategory are set together, or both are null. Never set one without the other.
3. Prefer (null, null) — "Other" — over a wrong guess. A forced bad match is worse than honest Other.
4. When several pairs in the taxonomy could fit, prefer the more specific one. If a Subcategory was clearly designed for the kind of segment you're seeing (e.g. a Subcategory whose name matches the channel/project/person in the segment), pick it over a generic catch-all Subcategory in the same Category.
5. confidence is a number in [0, 1] reflecting how clearly the segment matches the chosen pair. Use 0 for (null, null) outputs.
6. The output array MUST have exactly the same length and order as the input segments list.`;

function escapeYaml(value: string): string {
  // Use plain single-quoted YAML string, doubling internal single quotes per
  // YAML spec. Wrapping in quotes is unambiguous regardless of what
  // punctuation the value contains.
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function dedupAndSortActivities(activities: string[]): string[] {
  const out = new Set<string>();
  for (const raw of activities) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    out.add(truncate(trimmed, MAX_ACTIVITY_LEN));
  }
  return [...out].sort();
}

function serializeTaxonomy(taxonomy: Taxonomy | null): string {
  if (!taxonomy || taxonomy.categories.length === 0) return '[]';
  const lines: string[] = [];
  for (const cat of taxonomy.categories) {
    lines.push(`  - category: ${escapeYaml(cat.name)}`);
    if (cat.subcategories.length === 0) {
      lines.push('    subcategories: []');
    } else {
      lines.push('    subcategories:');
      for (const sub of cat.subcategories) {
        lines.push(`      - ${escapeYaml(sub)}`);
      }
    }
  }
  return `\n${lines.join('\n')}`;
}

function serializeSegment(seg: PromptSegment): string {
  const app = seg.app === null ? 'null' : escapeYaml(seg.app);
  const window =
    seg.window === null
      ? 'null'
      : escapeYaml(truncate(seg.window, MAX_WINDOW_LEN));
  const activities = dedupAndSortActivities(seg.activities);
  const lines = [
    `  - app: ${app}`,
    `    window: ${window}`,
    `    durationMs: ${Math.round(seg.durationMs)}`,
  ];
  if (activities.length === 0) {
    lines.push('    activities: []');
  } else {
    lines.push('    activities:');
    for (const a of activities) {
      lines.push(`      - ${escapeYaml(a)}`);
    }
  }
  return lines.join('\n');
}

function serializeUserContext(userContext: string | undefined): string {
  if (!userContext || userContext.trim().length === 0) return '';
  return `user_context: |\n${userContext
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')}\n`;
}

export function buildTaxonomyUserMessage(
  existingTaxonomy: Taxonomy | null,
  segments: PromptSegment[],
  userContext?: string,
): string {
  const contextBlock = serializeUserContext(userContext);
  const taxonomyBlock = serializeTaxonomy(existingTaxonomy);
  const segmentLines = segments.map(serializeSegment).join('\n');
  return `${contextBlock}existing_taxonomy:${taxonomyBlock}\nsegments:\n${segmentLines}`;
}

export function buildClassifyUserMessage(
  taxonomy: Taxonomy,
  segments: PromptSegment[],
  userContext?: string,
): string {
  const contextBlock = serializeUserContext(userContext);
  const taxonomyBlock = serializeTaxonomy(taxonomy);
  const segmentLines = segments.map(serializeSegment).join('\n');
  return `${contextBlock}taxonomy:${taxonomyBlock}\nsegments:\n${segmentLines}`;
}
