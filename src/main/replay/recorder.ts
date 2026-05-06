import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import type { WindowContext } from '../../shared/types';
import type {
  ProviderDebug,
  ProviderId,
  SummarizeResult,
} from '../ai/types';
import { type DevCaptureRow, getDevCapturesDir, insertDevCapture } from '../db';

interface SuccessEvent {
  kind: 'success';
  capturedAt: number;
  image: Buffer;
  windowCtx: WindowContext;
  debug: ProviderDebug;
  result: SummarizeResult;
  sampleId: number;
}

interface DlpBlockedEvent {
  kind: 'dlp_blocked';
  capturedAt: number;
  image: Buffer;
  windowCtx: WindowContext;
  debug: ProviderDebug;
  sampleId: number;
}

interface ErrorEvent {
  kind: 'error';
  capturedAt: number;
  image: Buffer | null;
  windowCtx: WindowContext | null;
  debug: ProviderDebug | null;
  sampleId: number | null;
  errorMessage: string;
  providerId: ProviderId;
}

export type CaptureEvent = SuccessEvent | DlpBlockedEvent | ErrorEvent;

function rowProvider(event: CaptureEvent): string {
  if (event.kind === 'error') return event.debug?.provider ?? event.providerId;
  return event.debug.provider;
}

function buildRow(event: CaptureEvent): DevCaptureRow {
  const id = randomUUID();
  const { image, debug } = event;
  return {
    id,
    sample_id: event.sampleId,
    captured_at: event.capturedAt,
    request_started_at: debug?.request_started_at ?? null,
    response_received_at: debug?.response_received_at ?? null,
    provider: rowProvider(event),
    model: debug?.model ?? null,
    outcome: event.kind,
    error_message: event.kind === 'error' ? event.errorMessage : null,
    focused_app: event.windowCtx?.focusedApp ?? null,
    focused_window: event.windowCtx?.focusedWindow ?? null,
    image_size_bytes: image?.length ?? null,
    request_json: debug
      ? JSON.stringify({
          ...debug.request,
          image_ref: image ? `dev-captures/${id}.jpg` : null,
        })
      : null,
    response_json: debug?.response ? JSON.stringify(debug.response) : null,
    parsed_result_json:
      event.kind === 'success' ? JSON.stringify(event.result) : null,
  };
}

export async function recordCapture(
  event: CaptureEvent,
): Promise<string | null> {
  if (app.isPackaged) return null;

  const row = buildRow(event);
  const tasks: Promise<void>[] = [];
  if (event.image) {
    const path = join(getDevCapturesDir(), `${row.id}.jpg`);
    tasks.push(writeFile(path, event.image));
  }
  tasks.push(Promise.resolve().then(() => insertDevCapture(row)));

  try {
    await Promise.all(tasks);
  } catch (err) {
    console.error('[replay] failed to record capture:', err);
    return null;
  }
  return row.id;
}
