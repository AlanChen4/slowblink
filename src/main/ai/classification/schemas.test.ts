import { describe, expect, test } from 'vitest';
import { ClassificationOutputSchema, TaxonomyOutputSchema } from './schemas';

describe('TaxonomyOutputSchema', () => {
  test('accepts well-formed output', () => {
    const result = TaxonomyOutputSchema.safeParse({
      new_categories: [
        { name: 'Working on slowblink', subcategories: ['Coding'] },
      ],
      new_subcategories: [
        { parent_category: 'Entertainment', subcategory: 'YouTube' },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty arrays (no additions proposed)', () => {
    const result = TaxonomyOutputSchema.safeParse({
      new_categories: [],
      new_subcategories: [],
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing keys', () => {
    const result = TaxonomyOutputSchema.safeParse({
      new_categories: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty category names', () => {
    const result = TaxonomyOutputSchema.safeParse({
      new_categories: [{ name: '', subcategories: ['Coding'] }],
      new_subcategories: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ClassificationOutputSchema', () => {
  test('accepts mixed bucketed and Other classifications', () => {
    const result = ClassificationOutputSchema.safeParse({
      classifications: [
        { category: 'Work', subcategory: 'Coding', confidence: 0.92 },
        { category: null, subcategory: null, confidence: 0 },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('confidence outside [0,1] is rejected', () => {
    const result = ClassificationOutputSchema.safeParse({
      classifications: [
        { category: 'Work', subcategory: 'Coding', confidence: 1.5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  test('rejects malformed entries (missing confidence)', () => {
    const result = ClassificationOutputSchema.safeParse({
      classifications: [{ category: 'Work', subcategory: 'Coding' }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects bare arrays — must be wrapped in { classifications }', () => {
    const result = ClassificationOutputSchema.safeParse([
      { category: 'Work', subcategory: 'Coding', confidence: 0.9 },
    ]);
    expect(result.success).toBe(false);
  });
});
