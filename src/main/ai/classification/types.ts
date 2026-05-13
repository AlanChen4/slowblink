import type { AIMode, Segment } from '../../../shared/types';

export interface Category {
  name: string;
  subcategories: string[];
}

export interface Taxonomy {
  categories: Category[];
}

export interface Classification {
  segmentHash: string;
  category: string | null;
  subcategory: string | null;
  confidence: number;
}

export interface SegmentWithActivities extends Segment {
  activities: string[];
}

export interface ClassificationConfig {
  taxonomyModel: string;
  classifyModel: string;
  batchSize: number;
  maxConcurrency: number;
  apiKey: string | null;
  aiMode: AIMode;
  // Free-form notes about the user that get injected into both LLM prompts.
  // Use for facts the model can't infer from window titles alone — e.g.
  // "X is the user's mentee", "the user's main employer is Y". Optional.
  userContext?: string;
}

export const DEFAULT_CLASSIFICATION_CONFIG: Omit<
  ClassificationConfig,
  'apiKey' | 'aiMode'
> = {
  taxonomyModel: 'gpt-5.4-mini',
  classifyModel: 'gpt-5.4-nano',
  batchSize: 10,
  maxConcurrency: 5,
};

export interface PromptSegment {
  app: string | null;
  window: string | null;
  durationMs: number;
  activities: string[];
}

export interface TaxonomyRequest {
  existingTaxonomy: Taxonomy | null;
  segments: PromptSegment[];
  model: string;
  userContext?: string;
}

export interface ProposedTaxonomyAdditions {
  newCategories: Category[];
  newSubcategories: { parentCategory: string; subcategory: string }[];
}

export interface ClassifyBatchRequest {
  taxonomy: Taxonomy;
  segments: PromptSegment[];
  model: string;
  userContext?: string;
}

export interface ClassifiedSegment {
  category: string | null;
  subcategory: string | null;
  confidence: number;
}

export interface ClassificationProvider {
  generateTaxonomy(
    req: TaxonomyRequest,
  ): Promise<ProposedTaxonomyAdditions | { blocked: true; reason: string }>;
  classifyBatch(
    req: ClassifyBatchRequest,
  ): Promise<ClassifiedSegment[] | { blocked: true; reason: string }>;
}
