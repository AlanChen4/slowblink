import { beforeEach, describe, expect, test, vi } from 'vitest';

type NetFetchOpts = {
  method: string;
  headers: Record<string, string>;
  body: string;
};
type NetFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};
type NetFetchFn = (
  url: string,
  opts: NetFetchOpts,
) => Promise<NetFetchResponse>;
type CloudAuthHeadersFn = () => Record<string, string>;
type RequireCloudEndpointFn = (direct: string, supabasePath: string) => string;

const { netFetch, cloudAuthHeaders, requireCloudEndpoint } = vi.hoisted(() => ({
  netFetch: vi.fn<NetFetchFn>(),
  cloudAuthHeaders: vi.fn<CloudAuthHeadersFn>(() => ({
    authorization: 'Bearer test-token',
  })),
  requireCloudEndpoint: vi.fn<RequireCloudEndpointFn>(
    (_direct, supabasePath) =>
      `https://cloud.example.test/functions/v1/${supabasePath}`,
  ),
}));

vi.mock('electron', () => ({ net: { fetch: netFetch } }));
vi.mock('../../../cloud/endpoint', () => ({
  cloudAuthHeaders,
  requireCloudEndpoint,
}));

import { createCloudProxyProvider } from './cloud-proxy';

const TAXONOMY = {
  categories: [{ name: 'Work', subcategories: ['Coding'] }],
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  netFetch.mockReset();
  cloudAuthHeaders.mockClear();
  requireCloudEndpoint.mockClear();
});

describe('createCloudProxyProvider', () => {
  test('generateTaxonomy POSTs to classify-taxonomy with the request body and auth headers', async () => {
    netFetch.mockResolvedValueOnce(
      jsonResponse({
        newCategories: [{ name: 'Work', subcategories: ['Coding'] }],
        newSubcategories: [],
      }),
    );
    const provider = createCloudProxyProvider();
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

    expect(netFetch).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = netFetch.mock.calls[0];
    expect(endpoint).toContain('classify-taxonomy');
    expect(opts.method).toBe('POST');
    expect(opts.headers.authorization).toBe('Bearer test-token');
    expect(opts.headers['content-type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
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
      newCategories: [{ name: 'Work', subcategories: ['Coding'] }],
      newSubcategories: [],
    });
  });

  test('generateTaxonomy returns { blocked, reason } when server flags DLP', async () => {
    netFetch.mockResolvedValueOnce(
      jsonResponse({ blocked: true, reason: 'pii-detected' }),
    );
    const provider = createCloudProxyProvider();
    const result = await provider.generateTaxonomy({
      existingTaxonomy: null,
      segments: [],
      model: 'gpt-5.4-mini',
    });
    expect(result).toEqual({ blocked: true, reason: 'pii-detected' });
  });

  test('generateTaxonomy defaults missing newCategories / newSubcategories to []', async () => {
    netFetch.mockResolvedValueOnce(jsonResponse({}));
    const provider = createCloudProxyProvider();
    const result = await provider.generateTaxonomy({
      existingTaxonomy: null,
      segments: [],
      model: 'gpt-5.4-mini',
    });
    expect(result).toEqual({ newCategories: [], newSubcategories: [] });
  });

  test('classifyBatch POSTs to classify-segments and returns classifications array', async () => {
    netFetch.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          { category: 'Work', subcategory: 'Coding', confidence: 0.9 },
        ],
      }),
    );
    const provider = createCloudProxyProvider();
    const result = await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [
        {
          app: 'Cursor',
          window: 'index.ts',
          durationMs: 60_000,
          activities: ['Editing index.ts'],
        },
      ],
      model: 'gpt-5.4-nano',
    });

    const [endpoint, opts] = netFetch.mock.calls[0];
    expect(endpoint).toContain('classify-segments');
    const body = JSON.parse(opts.body as string);
    expect(body.taxonomy).toEqual(TAXONOMY);
    expect(body.model).toBe('gpt-5.4-nano');
    expect(result).toEqual([
      { category: 'Work', subcategory: 'Coding', confidence: 0.9 },
    ]);
  });

  test('classifyBatch returns { blocked, reason } when server flags DLP', async () => {
    netFetch.mockResolvedValueOnce(
      jsonResponse({ blocked: true, reason: 'pii' }),
    );
    const provider = createCloudProxyProvider();
    const result = await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-nano',
    });
    expect(result).toEqual({ blocked: true, reason: 'pii' });
  });

  test('classifyBatch throws on malformed body missing classifications array', async () => {
    netFetch.mockResolvedValueOnce(jsonResponse({ wat: 'no' }));
    const provider = createCloudProxyProvider();
    await expect(
      provider.classifyBatch({
        taxonomy: TAXONOMY,
        segments: [],
        model: 'gpt-5.4-nano',
      }),
    ).rejects.toThrow(/malformed/i);
  });

  test('non-2xx HTTP status throws with the status code surfaced', async () => {
    netFetch.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500));
    const provider = createCloudProxyProvider();
    await expect(
      provider.classifyBatch({
        taxonomy: TAXONOMY,
        segments: [],
        model: 'gpt-5.4-nano',
      }),
    ).rejects.toThrow(/500/);
  });

  test('missing reason in DLP block falls back to "unknown"', async () => {
    netFetch.mockResolvedValueOnce(jsonResponse({ blocked: true }));
    const provider = createCloudProxyProvider();
    const result = await provider.classifyBatch({
      taxonomy: TAXONOMY,
      segments: [],
      model: 'gpt-5.4-nano',
    });
    expect(result).toEqual({ blocked: true, reason: 'unknown' });
  });
});
