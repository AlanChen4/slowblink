import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProviderDebug, SummarizeResult } from '../ai/types';

const writes: { path: string; bytes: number }[] = [];
const inserts: unknown[] = [];
const electronStub = { app: { isPackaged: false } };

vi.mock('electron', () => electronStub);

vi.mock('node:fs/promises', () => ({
  writeFile: async (path: string, bytes: Buffer) => {
    writes.push({ path, bytes: bytes.length });
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'uuid-fixed-1234',
}));

vi.mock('../db', () => ({
  getDevCapturesDir: () => '/fake/userData/dev-captures',
  insertDevCapture: (row: unknown) => {
    inserts.push(row);
  },
}));

let recordCapture: typeof import('./recorder').recordCapture;

beforeEach(async () => {
  writes.length = 0;
  inserts.length = 0;
  electronStub.app.isPackaged = false;
  vi.resetModules();
  ({ recordCapture } = await import('./recorder'));
});

afterEach(() => {
  vi.clearAllMocks();
});

const baseDebug: ProviderDebug = {
  provider: 'byo-openai',
  model: 'gpt-test',
  request: {
    system_prompt: 'you are a tester',
    user_message_text: 'Active window: Tester — main.ts',
  },
  request_started_at: 1000,
  response_received_at: 1500,
  response: {
    parsed_output: { confidence: 0.9, app: 'Tester', activity: 'testing' },
    raw_body: { id: 'r-1' },
    usage: { total_tokens: 17 },
    finish_reason: 'stop',
    model_id_returned: 'gpt-test-2026',
  },
  blocked: false,
};

const baseResult: SummarizeResult = {
  confidence: 0.9,
  app: 'Tester',
  activity: 'testing',
};

const baseWindow = {
  focusedApp: 'Tester',
  focusedWindow: 'main.ts',
  openWindows: [],
};

describe('recordCapture', () => {
  test('packaged build is a no-op even with toggle on', async () => {
    electronStub.app.isPackaged = true;
    const id = await recordCapture({
      kind: 'success',
      capturedAt: 100,
      image: Buffer.from('jpeg'),
      windowCtx: baseWindow,
      debug: baseDebug,
      result: baseResult,
      sampleId: 7,
    });
    expect(id).toBeNull();
    expect(writes).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  test('success: writes JPEG and inserts a success row with parsed result', async () => {
    const id = await recordCapture({
      kind: 'success',
      capturedAt: 100,
      image: Buffer.from('jpeg-bytes'),
      windowCtx: baseWindow,
      debug: baseDebug,
      result: baseResult,
      sampleId: 42,
    });
    expect(id).toBe('uuid-fixed-1234');
    expect(writes).toEqual([
      { path: '/fake/userData/dev-captures/uuid-fixed-1234.jpg', bytes: 10 },
    ]);
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.id).toBe('uuid-fixed-1234');
    expect(row.outcome).toBe('success');
    expect(row.sample_id).toBe(42);
    expect(row.error_message).toBeNull();
    expect(row.provider).toBe('byo-openai');
    expect(row.model).toBe('gpt-test');
    expect(row.image_size_bytes).toBe(10);
    expect(JSON.parse(row.parsed_result_json as string)).toEqual(baseResult);
    const req = JSON.parse(row.request_json as string);
    expect(req.image_ref).toBe('dev-captures/uuid-fixed-1234.jpg');
    expect(req.system_prompt).toContain('tester');
  });

  test('takeScreenshot failure: no image, no debug → error row, no JPEG', async () => {
    const id = await recordCapture({
      kind: 'error',
      capturedAt: 100,
      image: null,
      windowCtx: null,
      debug: null,
      sampleId: null,
      errorMessage: 'Screen recording permission not granted',
      providerId: 'cloud-proxy',
    });
    expect(id).toBe('uuid-fixed-1234');
    expect(writes).toHaveLength(0);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.outcome).toBe('error');
    expect(row.error_message).toBe('Screen recording permission not granted');
    expect(row.image_size_bytes).toBeNull();
    expect(row.request_json).toBeNull();
    expect(row.response_json).toBeNull();
    expect(row.provider).toBe('cloud-proxy');
  });

  test('summarize failure with image: error row keeps JPEG and request', async () => {
    const id = await recordCapture({
      kind: 'error',
      capturedAt: 100,
      image: Buffer.from('jpeg'),
      windowCtx: baseWindow,
      debug: null,
      sampleId: null,
      errorMessage: 'fetch failed',
      providerId: 'byo-openai',
    });
    expect(id).toBe('uuid-fixed-1234');
    expect(writes).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.outcome).toBe('error');
    expect(row.error_message).toBe('fetch failed');
    expect(row.image_size_bytes).toBe(4);
  });

  test('DLP block: outcome=dlp_blocked, parsed_result is null', async () => {
    const blockedDebug: ProviderDebug = {
      provider: 'cloud-proxy',
      model: null,
      request: {
        system_prompt: 'cloud',
        user_message_text: 'focusedApp=Tester focusedWindow=main.ts',
      },
      request_started_at: 1000,
      response_received_at: 1500,
      response: {
        edge_function_body: { blocked: true, reason: 'sensitive content' },
      },
      blocked: true,
    };
    const id = await recordCapture({
      kind: 'dlp_blocked',
      capturedAt: 100,
      image: Buffer.from('jpeg'),
      windowCtx: baseWindow,
      debug: blockedDebug,
      sampleId: 99,
    });
    expect(id).toBe('uuid-fixed-1234');
    const row = inserts[0] as Record<string, unknown>;
    expect(row.outcome).toBe('dlp_blocked');
    expect(row.parsed_result_json).toBeNull();
    expect(row.sample_id).toBe(99);
    const resp = JSON.parse(row.response_json as string);
    expect(resp.edge_function_body.blocked).toBe(true);
  });

  test('schema validation failure: error outcome retains malformed response', async () => {
    const malformedDebug: ProviderDebug = {
      provider: 'byo-openai',
      model: 'gpt-test',
      request: baseDebug.request,
      request_started_at: 1000,
      response_received_at: 1500,
      response: {
        parsed_output: undefined,
        raw_body: { choices: [{ message: { content: 'not json' } }] },
      },
      blocked: false,
    };
    const id = await recordCapture({
      kind: 'error',
      capturedAt: 100,
      image: Buffer.from('jpeg'),
      windowCtx: baseWindow,
      debug: malformedDebug,
      sampleId: null,
      errorMessage: 'schema validation failed: …',
      providerId: 'byo-openai',
    });
    expect(id).toBe('uuid-fixed-1234');
    const row = inserts[0] as Record<string, unknown>;
    expect(row.outcome).toBe('error');
    expect(row.error_message).toContain('schema validation');
    expect(row.response_json).not.toBeNull();
  });
});
