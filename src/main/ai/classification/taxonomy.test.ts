import { describe, expect, test } from 'vitest';
import { mergeProposedAdditions } from './taxonomy';
import type { Taxonomy } from './types';

describe('mergeProposedAdditions', () => {
  test('adds brand-new categories', () => {
    const merged = mergeProposedAdditions(null, {
      newCategories: [
        { name: 'Work', subcategories: ['Coding', 'Reviewing PR'] },
      ],
      newSubcategories: [],
    });
    expect(merged.categories).toHaveLength(1);
    expect(merged.categories[0].name).toBe('Work');
    expect(merged.categories[0].subcategories).toEqual([
      'Coding',
      'Reviewing PR',
    ]);
  });

  test('adds new subcategories under an existing category', () => {
    const existing: Taxonomy = {
      categories: [{ name: 'Work', subcategories: ['Coding'] }],
    };
    const merged = mergeProposedAdditions(existing, {
      newCategories: [],
      newSubcategories: [
        { parentCategory: 'Work', subcategory: 'Reviewing PR' },
      ],
    });
    expect(merged.categories[0].subcategories).toEqual([
      'Coding',
      'Reviewing PR',
    ]);
  });

  test('case-insensitive dedup on category names', () => {
    const existing: Taxonomy = {
      categories: [{ name: 'Work', subcategories: ['Coding'] }],
    };
    const merged = mergeProposedAdditions(existing, {
      newCategories: [{ name: 'work', subcategories: ['Designing UI'] }],
      newSubcategories: [],
    });
    // The duplicate-named category should NOT be created; its subs should be
    // folded into the existing one.
    expect(merged.categories).toHaveLength(1);
    expect(merged.categories[0].name).toBe('Work');
    expect(merged.categories[0].subcategories).toContain('Designing UI');
  });

  test('case-insensitive dedup on subcategory names', () => {
    const existing: Taxonomy = {
      categories: [{ name: 'Work', subcategories: ['Coding'] }],
    };
    const merged = mergeProposedAdditions(existing, {
      newCategories: [],
      newSubcategories: [{ parentCategory: 'work', subcategory: 'coding' }],
    });
    expect(merged.categories[0].subcategories).toEqual(['Coding']);
  });

  test('subcategory pointing at non-existent parent is silently dropped', () => {
    const merged = mergeProposedAdditions(
      { categories: [{ name: 'Work', subcategories: ['Coding'] }] },
      {
        newCategories: [],
        newSubcategories: [
          { parentCategory: 'NotARealCategory', subcategory: 'Whatever' },
        ],
      },
    );
    expect(merged.categories).toHaveLength(1);
    expect(merged.categories[0].subcategories).toEqual(['Coding']);
  });

  test('does not mutate the existing taxonomy', () => {
    const existing: Taxonomy = {
      categories: [{ name: 'Work', subcategories: ['Coding'] }],
    };
    const snapshot = JSON.stringify(existing);
    mergeProposedAdditions(existing, {
      newCategories: [{ name: 'Play', subcategories: ['YouTube'] }],
      newSubcategories: [
        { parentCategory: 'Work', subcategory: 'Reviewing PR' },
      ],
    });
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});
