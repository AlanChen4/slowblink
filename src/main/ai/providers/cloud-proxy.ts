import type { WindowContext } from '../../capture';
import { cloudAuthHeaders, requireCloudEndpoint } from '../../cloud/endpoint';
import { blockedResult, type SummarizeResult } from '../types';

interface CloudSummarizeResponse {
  blocked?: boolean;
  reason?: string;
  confidence?: number;
  app?: string | null;
  activity?: string;
  category?: SummarizeResult['category'];
}

export async function summarizeWithCloud(
  image: Buffer,
  windowCtx: WindowContext,
): Promise<SummarizeResult> {
  const res = await fetch(requireCloudEndpoint('summarize', 'ai-summarize'), {
    method: 'POST',
    headers: { ...cloudAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      image: image.toString('base64'),
      focusedApp: windowCtx.focusedApp,
      focusedWindow: windowCtx.focusedWindow,
    }),
  });

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
    typeof data.category !== 'string' ||
    typeof data.confidence !== 'number'
  ) {
    throw new Error('Cloud AI returned malformed response');
  }
  return {
    confidence: data.confidence,
    app: data.app ?? null,
    activity: data.activity,
    category: data.category,
  };
}
