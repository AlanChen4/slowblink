import { describe, expect, test } from 'vitest';
import { createErrorTracker } from './error-policy';

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
