// POST /functions/v1/classify-segments
//
// Paid-only. Proxies a Pass 2 (per-segment classification) call through
// Cloudflare AI Gateway → OpenAI. Client batches segments before calling here
// (limit MAX_SEGMENTS). DLP block returns { blocked: true }.
//
// Contract (matches src/main/ai/classification/providers/cloud-proxy.ts):
//   Request:  { taxonomy: Taxonomy, segments: PromptSegment[], model: string }
//   Response: { classifications: ClassifiedSegment[] } | { blocked: true, reason }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUser, requirePaid } from '../_shared/auth.ts';
import { requireEnv } from '../_shared/env.ts';
import { jsonResponse, ValidationError } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';

const DEFAULT_MODEL = 'gpt-5.4-nano';
const MAX_SEGMENTS = 20;
const MAX_ACTIVITIES_PER_SEGMENT = 50;
const MAX_STRING_LEN = 500;

const SYSTEM_PROMPT = [
  'You classify a user\'s screen-activity segments into a fixed Taxonomy of (Category, Subcategory) pairs.',
  '',
  'You will receive:',
  '- taxonomy: the closed set of valid (Category, Subcategory) pairs.',
  '- segments: activity segments to classify, each with an app, window title, durationMs, and a list of activity descriptions captured from screenshots.',
  '',
  'For each segment, output the single best-matching (Category, Subcategory) pair from the taxonomy, OR (null, null) if no pair is a reasonable fit.',
  '',
  'Rules:',
  '1. The category MUST exactly match a category name from the taxonomy (case-sensitive). The subcategory MUST exactly match one of that category\'s subcategories.',
  '2. Either both category and subcategory are set together, or both are null. Never set one without the other.',
  '3. Prefer (null, null) — "Other" — over a wrong guess. A forced bad match is worse than honest Other.',
  '4. confidence is a number in [0, 1] reflecting how clearly the segment matches the chosen pair. Use 0 for (null, null) outputs.',
  '5. The output array MUST have exactly the same length and order as the input segments list.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['classifications'],
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'subcategory', 'confidence'],
        properties: {
          category: { type: ['string', 'null'] },
          subcategory: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
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
  taxonomy: TaxonomyShape;
  segments: PromptSegment[];
  model: string;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateTaxonomy(v: unknown): TaxonomyShape {
  if (!v || typeof v !== 'object') throw new ValidationError('taxonomy must be object');
  const obj = v as { categories?: unknown };
  if (!Array.isArray(obj.categories)) throw new ValidationError('taxonomy.categories must be array');
  const categories = obj.categories.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new ValidationError(`taxonomy.categories[${i}] must be object`);
    }
    const cat = c as { name?: unknown; subcategories?: unknown };
    if (!isString(cat.name)) throw new ValidationError(`taxonomy.categories[${i}].name must be string`);
    if (!Array.isArray(cat.subcategories)) {
      throw new ValidationError(`taxonomy.categories[${i}].subcategories must be array`);
    }
    return {
      name: cat.name.slice(0, MAX_STRING_LEN),
      subcategories: cat.subcategories
        .filter(isString)
        .map((s) => s.slice(0, MAX_STRING_LEN)),
    };
  });
  if (categories.length === 0) {
    throw new ValidationError('taxonomy.categories must contain at least one category');
  }
  return { categories };
}

function validateSegments(v: unknown): PromptSegment[] {
  if (!Array.isArray(v)) throw new ValidationError('segments must be array');
  if (v.length === 0) throw new ValidationError('segments must contain at least one entry');
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
    taxonomy: validateTaxonomy(b.taxonomy),
    segments: validateSegments(b.segments),
    model: isString(b.model) && b.model.length > 0 ? b.model : DEFAULT_MODEL,
  };
}

function escapeYaml(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function serializeTaxonomy(taxonomy: TaxonomyShape): string {
  if (taxonomy.categories.length === 0) return '[]';
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
  return `taxonomy:${serializeTaxonomy(body.taxonomy)}\nsegments:\n${body.segments.map(serializeSegment).join('\n')}`;
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

interface ParsedClassification {
  category: string | null;
  subcategory: string | null;
  confidence: number;
}

function parseStructuredOutput(raw: unknown): ParsedClassification[] {
  if (!raw || typeof raw !== 'object') throw new Error('empty model response');
  const content = (raw as OpenAIResponse).choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('no content in model response');
  const parsed = JSON.parse(content);
  if (!parsed || !Array.isArray(parsed.classifications)) {
    throw new Error('malformed structured output');
  }
  return parsed.classifications as ParsedClassification[];
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
        json_schema: { name: 'classifications', strict: true, schema: RESPONSE_SCHEMA },
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
    return jsonResponse({ classifications: parsed });
  }),
);
