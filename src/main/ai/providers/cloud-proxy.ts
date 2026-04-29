import { net } from 'electron';
import type { WindowContext } from '../../capture';
import { cloudAuthHeaders, requireCloudEndpoint } from '../../cloud/endpoint';
import { blockedResult, type SummarizeResult } from '../types';

// Cloudflare AI Gateway rejects bodies above ~5 MB; fail fast before we waste
// a round-trip and so users see a recognizable error.
const MAX_IMAGE_BYTES = 4_000_000;

interface CloudSummarizeResponse {
  blocked?: boolean;
  reason?: string;
  confidence?: number;
  app?: string | null;
  activity?: string;
}

export async function summarizeWithCloud(
  image: Buffer,
  windowCtx: WindowContext,
): Promise<SummarizeResult> {
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Screenshot too large for cloud AI (${image.length} bytes, max ${MAX_IMAGE_BYTES})`,
    );
  }
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
  if (data.blocked) {
    console.log('[cloud-ai] response blocked by DLP:', data.reason);
    return blockedResult();
  }
  if (
    typeof data.activity !== 'string' ||
    typeof data.confidence !== 'number'
  ) {
    throw new Error('Cloud AI returned malformed response');
  }
  return {
    confidence: data.confidence,
    app: data.app ?? null,
    activity: data.activity,
  };
}
