export interface SummarizeResult {
  confidence: number;
  app: string | null;
  activity: string;
}

export const DLP_BLOCKED_ACTIVITY = '[Blocked by DLP]';

export function blockedResult(): SummarizeResult {
  return {
    confidence: 0,
    app: null,
    activity: DLP_BLOCKED_ACTIVITY,
  };
}
