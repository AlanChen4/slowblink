import { describe, expect, test } from 'vitest';
import { segmentHash } from './hash';

const baseSeg = {
  focusedApp: 'Cursor',
  focusedWindow: 'segmenter.ts — slowblink',
};

describe('segmentHash', () => {
  test('returns a stable 64-char hex digest', () => {
    const h = segmentHash(baseSeg, ['Editing segmenter.ts']);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  test('same inputs → same hash', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts', 'Running tests']);
    const b = segmentHash(baseSeg, ['Editing segmenter.ts', 'Running tests']);
    expect(a).toBe(b);
  });

  test('activity order does not affect the hash', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts', 'Running tests']);
    const b = segmentHash(baseSeg, ['Running tests', 'Editing segmenter.ts']);
    expect(a).toBe(b);
  });

  test('duplicated activities are deduped before hashing', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts']);
    const b = segmentHash(baseSeg, [
      'Editing segmenter.ts',
      'Editing segmenter.ts',
    ]);
    expect(a).toBe(b);
  });

  test('different activities → different hashes', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts']);
    const b = segmentHash(baseSeg, ['Reading docs']);
    expect(a).not.toBe(b);
  });

  test('different focusedApp → different hashes', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts']);
    const b = segmentHash(
      { focusedApp: 'Brave Browser', focusedWindow: baseSeg.focusedWindow },
      ['Editing segmenter.ts'],
    );
    expect(a).not.toBe(b);
  });

  test('different focusedWindow (post-normalize) → different hashes', () => {
    const a = segmentHash(baseSeg, ['Editing segmenter.ts']);
    const b = segmentHash(
      { focusedApp: 'Cursor', focusedWindow: 'index.ts — slowblink' },
      ['Editing segmenter.ts'],
    );
    expect(a).not.toBe(b);
  });

  test('focusedWindow noise that normalize strips collapses to one hash', () => {
    // Counter prefix + browser suffix variants normalize to the same key.
    const a = segmentHash(
      {
        focusedApp: 'Brave Browser',
        focusedWindow: '(3) Inbox - Gmail - Brave',
      },
      ['Reading email'],
    );
    const b = segmentHash(
      {
        focusedApp: 'Brave Browser',
        focusedWindow: 'Inbox - Gmail - Brave - Lumos Fellows',
      },
      ['Reading email'],
    );
    expect(a).toBe(b);
  });

  test('null app and null window hash to a defined value', () => {
    const h = segmentHash({ focusedApp: null, focusedWindow: null }, []);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
