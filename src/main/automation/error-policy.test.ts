import { describe, expect, test } from 'vitest';
import { createErrorTracker, formatRunnerError } from './error-policy';

describe('createErrorTracker', () => {
  test('starts clean', () => {
    const t = createErrorTracker({ threshold: 3 });
    expect(t.getState()).toEqual({
      lastError: null,
      autoPaused: null,
      consecutiveErrors: 0,
    });
  });

  test('recordFailure increments and stores message', () => {
    const t = createErrorTracker({ threshold: 3 });
    t.recordFailure('first');
    expect(t.getState()).toEqual({
      lastError: 'first',
      autoPaused: null,
      consecutiveErrors: 1,
    });

    t.recordFailure('second');
    expect(t.getState()).toEqual({
      lastError: 'second',
      autoPaused: null,
      consecutiveErrors: 2,
    });
  });

  test('autoPaused fires at threshold and carries the latest message', () => {
    const t = createErrorTracker({ threshold: 3 });
    t.recordFailure('a');
    t.recordFailure('b');
    expect(t.getState().autoPaused).toBeNull();
    t.recordFailure('c');
    expect(t.getState().autoPaused).toBe('c');
  });

  test('further failures past threshold keep autoPaused set to the latest', () => {
    const t = createErrorTracker({ threshold: 2 });
    t.recordFailure('one');
    t.recordFailure('two');
    expect(t.getState().autoPaused).toBe('two');
    t.recordFailure('three');
    expect(t.getState().autoPaused).toBe('three');
    expect(t.getState().consecutiveErrors).toBe(3);
  });

  test('clearFailures resets everything', () => {
    const t = createErrorTracker({ threshold: 2 });
    t.recordFailure('a');
    t.recordFailure('b');
    expect(t.getState().autoPaused).toBe('b');
    t.clearFailures();
    expect(t.getState()).toEqual({
      lastError: null,
      autoPaused: null,
      consecutiveErrors: 0,
    });
  });

  test('threshold of 1 auto-pauses on first failure', () => {
    const t = createErrorTracker({ threshold: 1 });
    t.recordFailure('boom');
    expect(t.getState().autoPaused).toBe('boom');
  });
});

describe('formatRunnerError', () => {
  test('returns the message of a plain Error', () => {
    expect(formatRunnerError(new Error('boom'))).toBe('boom');
  });

  test('appends a single Error cause', () => {
    const cause = new Error('connect ENOTFOUND api.openai.com');
    const err = new TypeError('fetch failed', { cause });
    expect(formatRunnerError(err)).toBe(
      'fetch failed — connect ENOTFOUND api.openai.com',
    );
  });

  test('walks nested Error causes', () => {
    const inner = new Error('socket hang up');
    const middle = new Error('TLS handshake failed', { cause: inner });
    const outer = new TypeError('fetch failed', { cause: middle });
    expect(formatRunnerError(outer)).toBe(
      'fetch failed — TLS handshake failed — socket hang up',
    );
  });

  test('dedupes repeated cause messages', () => {
    const cause = new Error('fetch failed');
    const err = new TypeError('fetch failed', { cause });
    expect(formatRunnerError(err)).toBe('fetch failed');
  });

  test('terminates on a cycle', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as Error & { cause?: unknown }).cause = b;
    (b as Error & { cause?: unknown }).cause = a;
    expect(formatRunnerError(a)).toBe('a — b');
  });

  test('stringifies non-Error values', () => {
    expect(formatRunnerError('weird')).toBe('weird');
    expect(formatRunnerError(42)).toBe('42');
    expect(formatRunnerError(null)).toBe('null');
  });
});
