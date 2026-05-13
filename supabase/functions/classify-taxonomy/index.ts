// POST /functions/v1/classify-taxonomy
//
// Paid-only. Proxies a Pass 1 (taxonomy generation) call through Cloudflare AI
// Gateway → OpenAI. If DLP blocks the content, we return { blocked: true } so
// the client can keep the existing Taxonomy and continue.
//
// Contract (matches src/main/ai/classification/providers/cloud-proxy.ts):
//   Request:  { existingTaxonomy: Taxonomy | null, segments: PromptSegment[], model: string }
//   Response: { newCategories, newSubcategories } | { blocked: true, reason }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUser, requirePaid } from '../_shared/auth.ts';
import { requireEnv } from '../_shared/env.ts';
import { jsonResponse, ValidationError } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';

const DEFAULT_MODEL = 'gpt-5.4-mini';
const MAX_SEGMENTS = 200;
const MAX_ACTIVITIES_PER_SEGMENT = 50;
const MAX_STRING_LEN = 500;

const SYSTEM_PROMPT = [
  'You are organizing a user\'s screen-activity segments into a hierarchical Taxonomy of (Category, Subcategory) pairs.',
  '',
  'A Category is a broad area of work or life (e.g. "Working on slowblink", "Personal communication", "Entertainment").',
  'A Subcategory is a specific activity within that Category (e.g. "Coding", "Designing UI", "Responding to email").',
  '',
  'You will receive:',
  '- existing_taxonomy: pairs already in the Taxonomy. Never modify or remove these.',
  '- segments: activity segments the user spent time on, each with an app, window title, durationMs, and a list of activity descriptions captured from screenshots.',
  '',
  'Your job: propose ADDITIONS to the Taxonomy so that nearly every segment can be classified into some (Category, Subcategory). Output JSON describing:',
  '- new_categories: brand-new Categories with their initial Subcategories.',
  '- new_subcategories: new Subcategories that belong under a Category that already exists OR under one you just proposed in new_categories.',
  '',
  'Rules for good additions:',
  '1. Subcategories should be specific enough that meaningfully different activities don\'t collapse into one bucket. Prefer "Coding for slowblink" + "Designing slowblink UI" over a single "slowblink work".',
  '2. Categories should be broad enough that several Subcategories fit under each. Don\'t make a Category just for one Subcategory unless it truly stands alone.',
  '3. Do not duplicate existing entries. Case-insensitive name collisions are not allowed.',
  '4. Names are short, human-readable phrases. No emoji, no quotes, no markdown.',
  '5. If existing_taxonomy already covers every segment well, return empty arrays for both fields. Avoid speculative additions.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['new_categories', 'new_subcategories'],
  properties: {
    new_categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'subcategories'],
        properties: {
          name: { type: 'string' },
          subcategories: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    new_subcategories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['parent_category', 'subcategory'],
        properties: {
          parent_category: { type: 'string' },
          subcategory: { type: 'string' },
        },
      },
    },
  },
} as const;

interface PromptSegment {
  app: string | null;
  window: string | null;
  durationMs: number;
  activities: string[];
}

interface TaxonomyShape {
  categories: { name: string; subcategories: string[] }[];
}

interface RequestBody {
  existingTaxonomy: TaxonomyShape | null;
  segments: PromptSegment[];
  model: string;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateTaxonomy(v: unknown): TaxonomyShape | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') throw new ValidationError('existingTaxonomy must be object or null');
  const obj = v as { categories?: unknown };
  if (!Array.isArray(obj.categories)) throw new ValidationError('existingTaxonomy.categories must be array');
  const categories = obj.categories.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new ValidationError(`existingTaxonomy.categories[${i}] must be object`);
    }
    const cat = c as { name?: unknown; subcategories?: unknown };
    if (!isString(cat.name)) throw new ValidationError(`existingTaxonomy.categories[${i}].name must be string`);
    if (!Array.isArray(cat.subcategories)) {
      throw new ValidationError(`existingTaxonomy.categories[${i}].subcategories must be array`);
    }
    return {
      name: cat.name.slice(0, MAX_STRING_LEN),
      subcategories: cat.subcategories
        .filter(isString)
        .map((s) => s.slice(0, MAX_STRING_LEN)),
    };
  });
  return { categories };
}

function validateSegments(v: unknown): PromptSegment[] {
  if (!Array.isArray(v)) throw new ValidationError('segments must be array');
  if (v.length > MAX_SEGMENTS) {
    throw new ValidationError(`segments must contain at most ${MAX_SEGMENTS} entries`);
  }
  return v.map((s, i) => {
    if (!s || typeof s !== 'object') throw new ValidationError(`segments[${i}] must be object`);
    const seg = s as Record<string, unknown>;
    const app = seg.app === null || isString(seg.app) ? (seg.app as string | null) : null;
    const window = seg.window === null || isString(seg.window) ? (seg.window as string | null) : null;
    const durationMs = typeof seg.durationMs === 'number' ? seg.durationMs : 0;
    const activities = Array.isArray(seg.activities) ? seg.activities.filter(isString) : [];
    return {
      app: app === null ? null : app.slice(0, MAX_STRING_LEN),
      window: window === null ? null : window.slice(0, MAX_STRING_LEN),
      durationMs,
      activities: activities
        .slice(0, MAX_ACTIVITIES_PER_SEGMENT)
        .map((a) => a.slice(0, MAX_STRING_LEN)),
    };
  });
}

function validateBody(body: unknown): RequestBody {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be json object');
  const b = body as Record<string, unknown>;
  return {
    existingTaxonomy: validateTaxonomy(b.existingTaxonomy),
    segments: validateSegments(b.segments),
    model: isString(b.model) && b.model.length > 0 ? b.model : DEFAULT_MODEL,
  };
}

function escapeYaml(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function serializeTaxonomy(taxonomy: TaxonomyShape | null): string {
  if (!taxonomy || taxonomy.categories.length === 0) return '[]';
  const lines: string[] = [];
  for (const cat of taxonomy.categories) {
    lines.push(`  - category: ${escapeYaml(cat.name)}`);
    if (cat.subcategories.length === 0) {
      lines.push('    subcategories: []');
    } else {
      lines.push('    subcategories:');
      for (const sub of cat.subcategories) lines.push(`      - ${escapeYaml(sub)}`);
    }
  }
  return `\n${lines.join('\n')}`;
}

function serializeSegment(seg: PromptSegment): string {
  const app = seg.app === null ? 'null' : escapeYaml(seg.app);
  const window = seg.window === null ? 'null' : escapeYaml(seg.window);
  const uniq = [...new Set(seg.activities.map((a) => a.trim()).filter(Boolean))].sort();
  const lines = [
    `  - app: ${app}`,
    `    window: ${window}`,
    `    durationMs: ${Math.round(seg.durationMs)}`,
  ];
  if (uniq.length === 0) {
    lines.push('    activities: []');
  } else {
    lines.push('    activities:');
    for (const a of uniq) lines.push(`      - ${escapeYaml(a)}`);
  }
  return lines.join('\n');
}

function buildUserMessage(body: RequestBody): string {
  return `existing_taxonomy:${serializeTaxonomy(body.existingTaxonomy)}\nsegments:\n${body.segments.map(serializeSegment).join('\n')}`;
}

function gatewayUrl(): string {
  const account = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const gateway = requireEnv('CLOUDFLARE_GATEWAY_ID');
  return `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/openai/chat/completions`;
}

interface DLPBlock {
  blocked: true;
  reason: string;
}

function detectDLPBlock(status: number, bodyText: string): DLPBlock | null {
  if (status === 200) return null;
  const lower = bodyText.toLowerCase();
  if (status === 403 || lower.includes('dlp') || lower.includes('content_filter')) {
    return { blocked: true, reason: bodyText.slice(0, 500) || `status_${status}` };
  }
  return null;
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
}

interface ParsedTaxonomy {
  new_categories: { name: string; subcategories: string[] }[];
  new_subcategories: { parent_category: string; subcategory: string }[];
}

function parseStructuredOutput(raw: unknown): ParsedTaxonomy {
  if (!raw || typeof raw !== 'object') throw new Error('empty model response');
  const content = (raw as OpenAIResponse).choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('no content in model response');
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object') throw new Error('malformed structured output');
  if (!Array.isArray(parsed.new_categories) || !Array.isArray(parsed.new_subcategories)) {
    throw new Error('malformed structured output');
  }
  return parsed as ParsedTaxonomy;
}

async function callGateway(body: RequestBody): Promise<Response> {
  const openaiKey = requireEnv('OPENAI_API_KEY');
  const cfToken = requireEnv('CLOUDFLARE_API_TOKEN');
  return fetch(gatewayUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
      'cf-aig-authorization': `Bearer ${cfToken}`,
    },
    body: JSON.stringify({
      model: body.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            { type: 'text', text: buildUserMessage(body) },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'taxonomy', strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
  });
}

Deno.serve(
  withPost(async (req) => {
    const user = await getUser(req);
    await requirePaid(user.id);

    const body = validateBody(await req.json().catch(() => null));
    const response = await callGateway(body);
    const text = await response.text();

    const block = detectDLPBlock(response.status, text);
    if (block) return jsonResponse(block);

    if (!response.ok) {
      console.error('gateway non-200:', response.status, text.slice(0, 500));
      return jsonResponse({ error: 'gateway_error', status: response.status }, 502);
    }

    const parsed = parseStructuredOutput(JSON.parse(text));
    return jsonResponse({
      newCategories: parsed.new_categories.map((c) => ({
        name: c.name,
        subcategories: c.subcategories,
      })),
      newSubcategories: parsed.new_subcategories.map((s) => ({
        parentCategory: s.parent_category,
        subcategory: s.subcategory,
      })),
    });
  }),
);
