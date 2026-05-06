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

export type ProviderId = 'byo-openai' | 'cloud-proxy';

export interface ProviderRequestEnvelope {
  system_prompt: string;
  user_message_text: string;
  ai_gateway?: boolean;
}

export interface ProviderResponseEnvelope {
  parsed_output?: SummarizeResult;
  raw_body?: unknown;
  usage?: unknown;
  finish_reason?: string;
  model_id_returned?: string;
  edge_function_body?: unknown;
}

export interface ProviderDebug {
  provider: ProviderId;
  model: string | null;
  request: ProviderRequestEnvelope;
  request_started_at: number;
  response_received_at: number;
  response: ProviderResponseEnvelope | null;
  blocked: boolean;
}

export interface SummarizeOutcome {
  result: SummarizeResult;
  debug: ProviderDebug;
}
