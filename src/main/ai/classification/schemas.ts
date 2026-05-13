import { z } from 'zod';

export const TaxonomyOutputSchema = z.object({
  new_categories: z.array(
    z.object({
      name: z.string().min(1),
      subcategories: z.array(z.string().min(1)),
    }),
  ),
  new_subcategories: z.array(
    z.object({
      parent_category: z.string().min(1),
      subcategory: z.string().min(1),
    }),
  ),
});

export const ClassificationOutputSchema = z.object({
  classifications: z.array(
    z.object({
      category: z.string().nullable(),
      subcategory: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
