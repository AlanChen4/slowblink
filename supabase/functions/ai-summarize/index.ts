// POST /functions/v1/ai-summarize
//
// Paid-only. Proxies screenshots through Cloudflare AI Gateway → OpenAI with
// DLP filtering. If DLP blocks the content, we return { blocked: true } so
// the client can still record a sample (marked as [Blocked by DLP]) rather
// than dropping it.
//
// Contract (matches src/main/ai/providers/cloud-proxy.ts):
//   Request:  { image: base64str, focusedApp: string|null, focusedWindow: string|null }
//   Response: { activity, confidence, app? } | { blocked: true, reason }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUser, requirePaid } from '../_shared/auth.ts';
import { requireEnv } from '../_shared/env.ts';
import { jsonResponse, ValidationError } from '../_shared/errors.ts';
import { withPost } from '../_shared/handlers.ts';

const MODEL = 'gpt-5.4-nano';

// Keep in sync with src/main/ai/providers/byo-openai.ts — both runtimes use
// the same instructions so BYO-key and cloud-AI users get comparable outputs.
const SYSTEM_PROMPT =
  "You will be given a screenshot of a user's device along with metadata about " +
  'their active window. Your objective is to summarize what the user is doing ' +
  'in this screenshot. Be concise and specific.';

// OpenAI JSON-schema for structured outputs. The gateway passes this through.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['confidence', 'app', 'activity'],
  properties: {
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    app: { type: ['string', 'null'] },
    activity: { type: 'string' },
  },
} as const;

interface RequestBody {
  image: string;
  focusedApp: string | null;
  focusedWindow: string | null;
}

function validateBody(body: unknown): RequestBody {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be json object');
  const { image, focusedApp, focusedWindow } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new ValidationError('image (base64) required');
  }
  return {
    image,
    focusedApp: typeof focusedApp === 'string' ? focusedApp : null,
    focusedWindow: typeof focusedWindow === 'string' ? focusedWindow : null,
  };
}

function buildWindowLine(focusedApp: string | null, focusedWindow: string | null): string {
  const app = focusedApp ?? 'unknown';
  const title = focusedWindow ?? '(no title)';
  return `Active window: ${app} — ${title.slice(0, 200)}`;
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

// Cloudflare AI Gateway DLP returns a specific error shape when it blocks.
// We treat any error response whose body mentions DLP/content_filter as a
// structured block rather than a failure — the client writes a
// "[Blocked by DLP]" sample and keeps going.
function detectDLPBlock(status: number, bodyText: string): DLPBlock | null {
  if (status === 200) return null;
  const lower = bodyText.toLowerCase();
  if (status === 403 || lower.includes('dlp') || lower.includes('content_filter')) {
    return { blocked: true, reason: bodyText.slice(0, 500) || `status_${status}` };
  }
  return null;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

function parseStructuredOutput(raw: unknown): {
  confidence: number;
  app: string | null;
  activity: string;
} {
  if (!raw || typeof raw !== 'object') throw new Error('empty model response');
  const choices = (raw as OpenAIResponse).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('no content in model response');
  const parsed = JSON.parse(content);
  if (
    typeof parsed.activity !== 'string' ||
    typeof parsed.confidence !== 'number'
  ) {
    throw new Error('malformed structured output');
  }
  return {
    confidence: parsed.confidence,
    app: typeof parsed.app === 'string' ? parsed.app : null,
    activity: parsed.activity,
  };
}

async function callGateway(body: RequestBody): Promise<Response> {
  const openaiKey = requireEnv('OPENAI_API_KEY');
  const cfToken = requireEnv('CLOUDFLARE_API_TOKEN');

  return fetch(gatewayUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
      'cf-aig-authorization': `Bearer ${cfToken}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            { type: 'text', text: buildWindowLine(body.focusedApp, body.focusedWindow) },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${body.image}` },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'sample', strict: true, schema: RESPONSE_SCHEMA },
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
    return jsonResponse(parsed);
  }),
);
