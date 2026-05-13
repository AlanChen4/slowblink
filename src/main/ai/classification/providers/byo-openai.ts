import { createHash } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { env } from '../../../env';
import {
  buildClassifyUserMessage,
  buildTaxonomyUserMessage,
  CLASSIFY_SYSTEM_PROMPT,
  TAXONOMY_SYSTEM_PROMPT,
} from '../prompts';
import { ClassificationOutputSchema, TaxonomyOutputSchema } from '../schemas';
import type {
  ClassificationProvider,
  ClassifiedSegment,
  ClassifyBatchRequest,
  ProposedTaxonomyAdditions,
  TaxonomyRequest,
} from '../types';

type Model = Awaited<ReturnType<typeof buildModel>>;

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
  const keyHash = createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `${keyHash} ${modelId}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const model = await buildModel(apiKey, modelId);
  modelCache.set(cacheKey, model);
  return model;
}

export function createByoOpenAIProvider(
  apiKey: string,
): ClassificationProvider {
  return {
    async generateTaxonomy(
      req: TaxonomyRequest,
    ): Promise<ProposedTaxonomyAdditions> {
      const model = await createModel(apiKey, req.model);
      const userMessage = buildTaxonomyUserMessage(
        req.existingTaxonomy,
        req.segments,
        req.userContext,
      );
      const result = await generateText({
        model,
        output: Output.object({ schema: TaxonomyOutputSchema }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TAXONOMY_SYSTEM_PROMPT },
              { type: 'text', text: userMessage },
            ],
          },
        ],
      });
      const parsed = result.output;
      return {
        newCategories: parsed.new_categories.map((c) => ({
          name: c.name,
          subcategories: c.subcategories,
        })),
        newSubcategories: parsed.new_subcategories.map((s) => ({
          parentCategory: s.parent_category,
          subcategory: s.subcategory,
        })),
      };
    },
    async classifyBatch(
      req: ClassifyBatchRequest,
    ): Promise<ClassifiedSegment[]> {
      const model = await createModel(apiKey, req.model);
      const userMessage = buildClassifyUserMessage(
        req.taxonomy,
        req.segments,
        req.userContext,
      );
      const result = await generateText({
        model,
        output: Output.object({ schema: ClassificationOutputSchema }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: CLASSIFY_SYSTEM_PROMPT },
              { type: 'text', text: userMessage },
            ],
          },
        ],
      });
      return result.output.classifications;
    },
  };
}
