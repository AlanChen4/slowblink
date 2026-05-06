import type { AIMode, WindowContext } from '../../shared/types';
import { providerIdFor, summarizeScreenshot } from '../ai/summarizer';
import type { ProviderDebug } from '../ai/types';
import { insertSample } from '../db';
import { recordCapture } from '../replay/recorder';
import { isReplayLoggingEnabled } from '../settings';
import { takeScreenshot } from './screen-capture';

export interface RunnerContext {
  apiKey: string | null;
  model: string;
  aiMode: AIMode;
}

export interface RunnerResult {
  sampleTs: number;
}

export type Runner = (ctx: RunnerContext) => Promise<RunnerResult>;

export const runCaptureTick: Runner = async (ctx) => {
  const replay = isReplayLoggingEnabled();
  const capturedAt = Date.now();
  let image: Buffer | null = null;
  let windowCtx: WindowContext | null = null;
  let debug: ProviderDebug | null = null;
  let sampleId: number | null = null;

  try {
    const shot = await takeScreenshot();
    image = shot.image;
    windowCtx = shot.windowCtx;
    const outcome = await summarizeScreenshot(
      shot.image,
      ctx.apiKey,
      ctx.model,
      shot.windowCtx,
      ctx.aiMode,
    );
    debug = outcome.debug;
    const sampleTs = Date.now();
    const sample = insertSample({
      ts: sampleTs,
      activity: outcome.result.activity,
      confidence: outcome.result.confidence,
      focusedApp: shot.windowCtx.focusedApp,
      focusedWindow: shot.windowCtx.focusedWindow,
    });
    sampleId = sample.id;
    if (replay) {
      await recordCapture(
        debug.blocked
          ? {
              kind: 'dlp_blocked',
              capturedAt,
              image,
              windowCtx,
              debug,
              sampleId,
            }
          : {
              kind: 'success',
              capturedAt,
              image,
              windowCtx,
              debug,
              result: outcome.result,
              sampleId,
            },
      );
    }
    return { sampleTs };
  } catch (err) {
    if (replay) {
      await recordCapture({
        kind: 'error',
        capturedAt,
        image,
        windowCtx,
        debug,
        sampleId,
        errorMessage: err instanceof Error ? err.message : String(err),
        providerId: providerIdFor(ctx.aiMode),
      });
    }
    throw err;
  }
};
