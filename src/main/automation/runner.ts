import type { AIMode } from '../../shared/types';
import { summarizeScreenshot } from '../ai/summarizer';
import { takeScreenshot } from '../capture';
import { insertSample } from '../db';

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
  const { image, windowCtx } = await takeScreenshot();
  const result = await summarizeScreenshot(
    image,
    ctx.apiKey,
    ctx.model,
    windowCtx,
    ctx.aiMode,
  );
  const sampleTs = Date.now();
  insertSample({
    ts: sampleTs,
    activity: result.activity,
    confidence: result.confidence,
    focusedApp: windowCtx.focusedApp,
    focusedWindow: windowCtx.focusedWindow,
  });
  return { sampleTs };
};
