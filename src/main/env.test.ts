import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createEnv } from './env';

describe('createEnv — empty-string normalization', () => {
  test('treats an empty OPENAI_API_KEY as absent', () => {
    const env = createEnv({
      schema: { OPENAI_API_KEY: z.string().min(1).optional() },
      runtimeEnv: { OPENAI_API_KEY: '' },
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  test('passes a populated OPENAI_API_KEY through', () => {
    const env = createEnv({
      schema: { OPENAI_API_KEY: z.string().min(1).optional() },
      runtimeEnv: { OPENAI_API_KEY: 'sk-live' },
    });
    expect(env.OPENAI_API_KEY).toBe('sk-live');
  });

  test('treats a missing OPENAI_API_KEY as absent', () => {
    const env = createEnv({
      schema: { OPENAI_API_KEY: z.string().min(1).optional() },
      runtimeEnv: {},
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });
});
