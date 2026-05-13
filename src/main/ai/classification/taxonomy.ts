import type {
  ClassificationProvider,
  PromptSegment,
  ProposedTaxonomyAdditions,
  Taxonomy,
} from './types';

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function findCategoryIndex(tax: Taxonomy, name: string): number {
  const needle = lower(name);
  return tax.categories.findIndex((c) => lower(c.name) === needle);
}

function hasSubcategory(
  category: { subcategories: string[] },
  sub: string,
): boolean {
  const needle = lower(sub);
  return category.subcategories.some((s) => lower(s) === needle);
}

export function mergeProposedAdditions(
  existing: Taxonomy | null,
  additions: ProposedTaxonomyAdditions,
): Taxonomy {
  const merged: Taxonomy = existing
    ? {
        categories: existing.categories.map((c) => ({
          ...c,
          subcategories: [...c.subcategories],
        })),
      }
    : { categories: [] };

  for (const newCat of additions.newCategories) {
    const idx = findCategoryIndex(merged, newCat.name);
    if (idx === -1) {
      const uniqSubs: string[] = [];
      for (const sub of newCat.subcategories) {
        if (!uniqSubs.some((s) => lower(s) === lower(sub))) uniqSubs.push(sub);
      }
      merged.categories.push({ name: newCat.name, subcategories: uniqSubs });
      continue;
    }
    // Category already exists — just add any genuinely new subcategories.
    const cat = merged.categories[idx];
    for (const sub of newCat.subcategories) {
      if (!hasSubcategory(cat, sub)) cat.subcategories.push(sub);
    }
  }

  for (const addSub of additions.newSubcategories) {
    const idx = findCategoryIndex(merged, addSub.parentCategory);
    if (idx === -1) continue; // parent doesn't exist → silently drop
    const cat = merged.categories[idx];
    if (!hasSubcategory(cat, addSub.subcategory)) {
      cat.subcategories.push(addSub.subcategory);
    }
  }

  return merged;
}

export interface GenerateTaxonomyOptions {
  provider: ClassificationProvider;
  existingTaxonomy: Taxonomy | null;
  segments: PromptSegment[];
  model: string;
  userContext?: string;
}

export async function generateTaxonomy(
  opts: GenerateTaxonomyOptions,
): Promise<Taxonomy> {
  if (opts.segments.length === 0) {
    return opts.existingTaxonomy ?? { categories: [] };
  }
  const result = await opts.provider.generateTaxonomy({
    existingTaxonomy: opts.existingTaxonomy,
    segments: opts.segments,
    model: opts.model,
    userContext: opts.userContext,
  });
  if ('blocked' in result) {
    return opts.existingTaxonomy ?? { categories: [] };
  }
  return mergeProposedAdditions(opts.existingTaxonomy, result);
}
