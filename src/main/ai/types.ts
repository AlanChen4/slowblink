import type { Category } from '../../shared/types';

export interface SummarizeResult {
  confidence: number;
  app: string | null;
  activity: string;
  category: Category;
}

export const DLP_BLOCKED_ACTIVITY = '[Blocked by DLP]';

export function blockedResult(): SummarizeResult {
  return {
    confidence: 0,
    app: null,
    activity: DLP_BLOCKED_ACTIVITY,
    category: 'other',
  };
}
