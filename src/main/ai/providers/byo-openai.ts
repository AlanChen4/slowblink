import { createHash } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { CATEGORIES } from '../../../shared/types';
import type { WindowContext } from '../../capture';
import { env } from '../../env';
import type { SummarizeResult } from '../types';

const SampleSchema = z.object({
  confidence: z.number().min(0).max(1),
  app: z.string().nullable().describe('Foreground app name if visible.'),
  activity: z
    .string()
    .describe('One short sentence: what the user is doing right now.'),
  category: z.enum(CATEGORIES),
});

const MAX_TITLE_LEN = 200;

let gatewayModulesPromise: Promise<{
  gateway: typeof import('ai-gateway-provider');
  unified: typeof import('ai-gateway-provider/providers/unified');
}> | null = null;

function loadGatewayModules() {
  if (!gatewayModulesPromise) {
    gatewayModulesPromise = Promise.all([
      import('ai-gateway-provider'),
      import('ai-gateway-provider/providers/unified'),
    ]).then(([gateway, unified]) => ({ gateway, unified }));
  }
  return gatewayModulesPromise;
}

type Model = Awaited<ReturnType<typeof buildModel>>;
const modelCache = new Map<string, Model>();

async function buildModel(apiKey: string, modelId: string) {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_GATEWAY_ID } =
    env;
  if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
    const { gateway: gatewayMod, unified: unifiedMod } =
      await loadGatewayModules();
    const gateway = gatewayMod.createAiGateway({
      accountId: CLOUDFLARE_ACCOUNT_ID,
      gateway: CLOUDFLARE_GATEWAY_ID,
      apiKey: CLOUDFLARE_API_TOKEN,
    });
    const unified = unifiedMod.createUnified({
      apiKey,
      supportsStructuredOutputs: true,
    });
    const unifiedId = modelId.includes('/') ? modelId : `openai/${modelId}`;
    return gateway(unified(unifiedId));
  }
  return createOpenAI({ apiKey })(modelId);
}

async function createModel(apiKey: string, modelId: string): Promise<Model> {
  // Hash the key before using it as a Map key so the plaintext stays out of
  // heap dumps, logs, or any future caching layer. 16 hex chars is ample
  // collision-resistance for a per-process cache.
  const keyHash = createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `${keyHash}\u0000${modelId}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const model = await buildModel(apiKey, modelId);
  modelCache.set(cacheKey, model);
  return model;
}

function truncate(s: string): string {
  return s.length > MAX_TITLE_LEN ? `${s.slice(0, MAX_TITLE_LEN)}…` : s;
}

function formatActiveWindow(ctx: WindowContext): string {
  const app = ctx.focusedApp ?? 'unknown';
  const title = ctx.focusedWindow ? truncate(ctx.focusedWindow) : '(no title)';
  return `Active window: ${app} — ${title}`;
}

export async function summarizeWithByoKey(
  image: Buffer,
  apiKey: string,
  modelId: string,
  windowCtx: WindowContext,
): Promise<SummarizeResult> {
  const { output } = await generateText({
    model: await createModel(apiKey, modelId),
    output: Output.object({ schema: SampleSchema }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "You will be given a screenshot of a user's device along with metadata about their active window. Your objective is to summarize what the user is doing in this screenshot. Be concise and specific. Pick the best category.",
          },
          { type: 'text', text: formatActiveWindow(windowCtx) },
          {
            type: 'image',
            image: `data:image/jpeg;base64,${image.toString('base64')}`,
          },
        ],
      },
    ],
  });
  return output;
}
