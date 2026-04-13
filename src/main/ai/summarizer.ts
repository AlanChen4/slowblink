import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { CATEGORIES, type Category } from '../../shared/types';
import type { WindowContext } from '../capture';
import { env } from '../env';

const MAX_TITLE_LEN = 200;

const SampleSchema = z.object({
  confidence: z.number().min(0).max(1),
  app: z.string().nullable().describe('Foreground app name if visible.'),
  activity: z
    .string()
    .describe('One short sentence: what the user is doing right now.'),
  category: z.enum(CATEGORIES),
});

interface SummarizeResult {
  confidence: number;
  app: string | null;
  activity: string;
  category: Category;
}

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
  const cacheKey = `${apiKey}\u0000${modelId}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const model = await buildModel(apiKey, modelId);
  modelCache.set(cacheKey, model);
  return model;
}

export async function summarizeScreenshot(
  image: Buffer,
  apiKey: string,
  model: string,
  windowCtx: WindowContext,
): Promise<SummarizeResult> {
  const { output } = await generateText({
    model: await createModel(apiKey, model),
    output: Output.object({ schema: SampleSchema }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "You will be given a screenshot of a user's device along with metadata about their active window. Your objective is to summarize what the user is doing in this screenshot. Be concise and specific. Pick the best category.",
          },
          {
            type: 'text',
            text: formatActiveWindow(windowCtx),
          },
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

function formatActiveWindow(ctx: WindowContext): string {
  const app = ctx.focusedApp ?? 'unknown';
  const title = ctx.focusedWindow ? truncate(ctx.focusedWindow) : '(no title)';
  return `Active window: ${app} — ${title}`;
}

function truncate(s: string): string {
  return s.length > MAX_TITLE_LEN ? `${s.slice(0, MAX_TITLE_LEN)}…` : s;
}
