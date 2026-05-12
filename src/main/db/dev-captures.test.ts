import { describe, expect, test } from 'vitest';
import { reconcileOrphans } from './dev-captures';

describe('reconcileOrphans', () => {
  test('returns nothing when files and rows match', () => {
    const r = reconcileOrphans(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(r.filesToUnlink).toEqual([]);
    expect(r.rowsToDelete).toEqual([]);
  });

  test('files without rows are flagged for unlink', () => {
    const r = reconcileOrphans(['a', 'b', 'c'], ['a']);
    expect(r.filesToUnlink.toSorted()).toEqual(['b', 'c']);
    expect(r.rowsToDelete).toEqual([]);
  });

  test('rows without files are flagged for delete', () => {
    const r = reconcileOrphans(['a'], ['a', 'b', 'c']);
    expect(r.filesToUnlink).toEqual([]);
    expect(r.rowsToDelete.toSorted()).toEqual(['b', 'c']);
  });

  test('handles both directions of mismatch in one pass', () => {
    const r = reconcileOrphans(['a', 'orphan-file'], ['a', 'orphan-row']);
    expect(r.filesToUnlink).toEqual(['orphan-file']);
    expect(r.rowsToDelete).toEqual(['orphan-row']);
  });

  test('handles empty inputs', () => {
    const r = reconcileOrphans([], []);
    expect(r.filesToUnlink).toEqual([]);
    expect(r.rowsToDelete).toEqual([]);
  });

  test('treats duplicates idempotently (Set semantics)', () => {
    const r = reconcileOrphans(['a', 'a', 'b'], ['b', 'b']);
    expect(r.filesToUnlink).toEqual(['a']);
    expect(r.rowsToDelete).toEqual([]);
  });
});
