import type { WindowContext } from '../capture';
import { getSettings } from '../settings';
import { summarizeWithByoKey } from './providers/byo-openai';
import { summarizeWithCloud } from './providers/cloud-proxy';
import type { SummarizeResult } from './types';

export async function summarizeScreenshot(
  image: Buffer,
  apiKey: string | null,
  model: string,
  windowCtx: WindowContext,
): Promise<SummarizeResult> {
  const { aiMode } = getSettings();
  if (aiMode === 'cloud-ai') {
    return summarizeWithCloud(image, windowCtx);
  }
  if (!apiKey) throw new Error('No API key configured');
  return summarizeWithByoKey(image, apiKey, model, windowCtx);
}
