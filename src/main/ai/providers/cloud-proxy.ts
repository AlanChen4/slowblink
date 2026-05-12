import { net } from 'electron';
import type { WindowContext } from '../../../shared/types';
import { cloudAuthHeaders, requireCloudEndpoint } from '../../cloud/endpoint';
import { logger } from '../../logger';
import {
  blockedResult,
  type ProviderDebug,
  type SummarizeOutcome,
} from '../types';

// Cloudflare AI Gateway rejects bodies above ~5 MB; fail fast before we waste
// a round-trip and so users see a recognizable error.
const MAX_IMAGE_BYTES = 4_000_000;

const CLOUD_PROMPT_LABEL =
  '(server-side prompt; see supabase/functions/ai-summarize)';

interface CloudSummarizeResponse {
  blocked?: boolean;
  reason?: string;
  confidence?: number;
  app?: string | null;
  activity?: string;
}

function makeUserMessage(windowCtx: WindowContext): string {
  return `focusedApp=${windowCtx.focusedApp ?? 'null'} focusedWindow=${windowCtx.focusedWindow ?? 'null'}`;
}

function makeDebug(
  windowCtx: WindowContext,
  startedAt: number,
  receivedAt: number,
  body: unknown,
  blocked: boolean,
): ProviderDebug {
  return {
    provider: 'cloud-proxy',
    model: null,
    request: {
      system_prompt: CLOUD_PROMPT_LABEL,
      user_message_text: makeUserMessage(windowCtx),
    },
    request_started_at: startedAt,
    response_received_at: receivedAt,
    response: { edge_function_body: body },
    blocked,
  };
}

export async function summarizeWithCloud(
  image: Buffer,
  windowCtx: WindowContext,
): Promise<SummarizeOutcome> {
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Screenshot too large for cloud AI (${image.length} bytes, max ${MAX_IMAGE_BYTES})`,
    );
  }
  const requestStartedAt = Date.now();
  const res = await net.fetch(
    requireCloudEndpoint('summarize', 'ai-summarize'),
    {
      method: 'POST',
      headers: { ...cloudAuthHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        image: image.toString('base64'),
        focusedApp: windowCtx.focusedApp,
        focusedWindow: windowCtx.focusedWindow,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Cloud AI returned ${res.status}`);
  }

  const data = (await res.json()) as CloudSummarizeResponse;
  const responseReceivedAt = Date.now();
  if (data.blocked) {
    logger.log('[cloud-ai] response blocked by DLP:', data.reason);
    return {
      result: blockedResult(),
      debug: makeDebug(
        windowCtx,
        requestStartedAt,
        responseReceivedAt,
        data,
        true,
      ),
    };
  }
  if (
    typeof data.activity !== 'string' ||
    typeof data.confidence !== 'number'
  ) {
    throw new Error('Cloud AI returned malformed response');
  }
  return {
    result: {
      confidence: data.confidence,
      app: data.app ?? null,
      activity: data.activity,
    },
    debug: makeDebug(
      windowCtx,
      requestStartedAt,
      responseReceivedAt,
      data,
      false,
    ),
  };
}
