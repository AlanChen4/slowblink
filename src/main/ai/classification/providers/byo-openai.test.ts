import { beforeEach, describe, expect, test, vi } from 'vitest';

type OpenAIBuilderFn = (modelId: string) => unknown;
type CreateOpenAIFn = () => OpenAIBuilderFn;
type OutputObjectFn = (opts: { schema: unknown }) => unknown;
type GenerateTextMessage = {
  role: string;
  content: { type: string; text?: string }[];
};
type GenerateTextFn = (opts: {
  model: unknown;
  output: unknown;
  messages: GenerateTextMessage[];
}) => Promise<{ output: unknown }>;

const { generateText, createOpenAI, openaiBuilder, OutputObject } = vi.hoisted(
  () => ({
    generateText: vi.fn<GenerateTextFn>(),
    openaiBuilder: vi.fn<OpenAIBuilderFn>((modelId) => ({
      __mockOpenAIModel: modelId,
    })),
    createOpenAI: vi.fn<CreateOpenAIFn>(),
    OutputObject: vi.fn<OutputObjectFn>((opts) => ({
      __schemaSentinel: opts.schema,
    })),
  }),
);
createOpenAI.mockImplementation(() => openaiBuilder);

vi.mock('../../../env', () => ({
  env: {
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
    CLOUDFLARE_GATEWAY_ID: undefined,
  },
}));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI }));
vi.mock('ai', () => ({ generateText, Output: { object: OutputObject } }));

import { createByoOpenAIProvider } from './byo-openai';

const TAXONOMY = {
  categories: [{ name: 'Work', subcategories: ['Coding'] }],
};

beforeEach(() => {
  generateText.mockReset();
  createOpenAI.mockClear();
  openaiBuilder.mockClear();
});

describe('createByoOpenAIProvider', () => {
  test('generateTaxonomy maps snake_case LLM output to camelCase result shape', async () => {
    generateText.mockResolvedValueOnce({
      output: {
        new_categories: [
          { name: 'Work', subcategories: ['Coding', 'Reviewing PR'] },
        ],
        new_subcategories: [
          { parent_category: 'Work', subcategory: 'Designing UI' },
        ],
      },
    });
    const provider = createByoOpenAIProvider('sk-test-1');
    const result = await provider.generateTaxonomy({
      existingTaxonomy: null,
      segments: [
        {
          app: 'Cursor',
          window: 'index.ts',
          durationMs: 60_000,
          activities: ['Editing index.ts'],
        },
      ],
      model: 'gpt-5.4-mini',
    });
    expect(result).toEqual({
      newCategories: [
        { name: 'Work', subcategories: ['Coding', 'Reviewing PR'] },
      ],
      newSubcategories: [
        { parentCategory: 'Work', subcategory: 'Designing UI' },
      ],
    });
  });

  test('classifyBatch returns the classifications array verbatim', async () => {
    generateText.mockResolvedValueOnce({
      output: {
        classifications: [
          { category: 'Work', subcategory: 'Coding', confidence: 0.9 },
          { category: null, subcategory: null, confidence: 0.1 },
        ],
      },
    });
    const provider = createByoOpenAIProvider('sk-test-2');
    const result = await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [
        {
          app: 'Cursor',
          window: 'index.ts',
          durationMs: 60_000,
          activities: ['Editing index.ts'],
        },
        {
          app: 'Slack',
          window: '#general',
          durationMs: 30_000,
          activities: ['Slacking'],
        },
      ],
      model: 'gpt-5.4-nano',
    });
    expect(result).toEqual([
      { category: 'Work', subcategory: 'Coding', confidence: 0.9 },
      { category: null, subcategory: null, confidence: 0.1 },
    ]);
  });

  test('model cache: same apiKey + modelId reuses the model on the second call', async () => {
    generateText.mockResolvedValue({
      output: { classifications: [] },
    });
    const provider = createByoOpenAIProvider('sk-cache-key');
    await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-nano',
    });
    await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-nano',
    });
    expect(createOpenAI).toHaveBeenCalledTimes(1);
    expect(openaiBuilder).toHaveBeenCalledTimes(1);
  });

  test('different modelIds bypass the cache', async () => {
    generateText.mockResolvedValue({
      output: { classifications: [] },
    });
    const provider = createByoOpenAIProvider('sk-cache-key-2');
    await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-mini',
    });
    await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-nano',
    });
    expect(openaiBuilder).toHaveBeenCalledTimes(2);
    expect(openaiBuilder).toHaveBeenNthCalledWith(1, 'gpt-5.4-mini');
    expect(openaiBuilder).toHaveBeenNthCalledWith(2, 'gpt-5.4-nano');
  });

  test('userContext is forwarded into the prompt user message', async () => {
    generateText.mockResolvedValueOnce({
      output: { classifications: [] },
    });
    const provider = createByoOpenAIProvider('sk-ctx');
    await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [
        {
          app: 'Cursor',
          window: 'index.ts',
          durationMs: 1000,
          activities: ['Editing index.ts'],
        },
      ],
      model: 'gpt-5.4-nano',
      userContext: 'CTX-MARKER-ABC',
    });
    const call = generateText.mock.calls[0][0];
    const texts = call.messages[0].content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('\n');
    expect(texts).toContain('CTX-MARKER-ABC');
  });
});
