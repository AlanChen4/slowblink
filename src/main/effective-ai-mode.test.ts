import { describe, expect, test } from 'vitest';
import type { AuthSession, Plan } from '../shared/types';
import { effectiveAiMode } from './effective-ai-mode';

const SIGNED_IN: AuthSession = {
  user: { id: 'u1', email: 'a@example.com' },
  expiresAt: Date.now() + 1_000_000,
};
const FREE: Plan = { tier: 'free', renewsAt: null };
const PAID: Plan = { tier: 'paid', renewsAt: null };

describe('effectiveAiMode', () => {
  test('returns the stored mode when it is byo-key', () => {
    expect(effectiveAiMode('byo-key', null, FREE)).toBe('byo-key');
    expect(effectiveAiMode('byo-key', SIGNED_IN, PAID)).toBe('byo-key');
  });

  test('downgrades cloud-ai to byo-key when not signed in', () => {
    expect(effectiveAiMode('cloud-ai', null, PAID)).toBe('byo-key');
  });

  test('downgrades cloud-ai to byo-key when signed in on free plan', () => {
    expect(effectiveAiMode('cloud-ai', SIGNED_IN, FREE)).toBe('byo-key');
  });

  test('keeps cloud-ai when signed in on paid plan (auto-restores after sign-in)', () => {
    expect(effectiveAiMode('cloud-ai', SIGNED_IN, PAID)).toBe('cloud-ai');
  });
});
