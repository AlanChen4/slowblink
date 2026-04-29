import { summarizeSession } from '../ai/insights-summarizer';
import { getUnsummarizedSessions } from '../db';
import { getApiKey, getSettings } from '../settings';

const pending: number[] = [];
let processing = false;

export function enqueueSummary(sessionId: number): void {
  pending.push(sessionId);
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || pending.length === 0) return;
  processing = true;
  try {
    while (pending.length > 0) {
      const id = pending.shift();
      if (id === undefined) break;
      await summarizeOne(id);
      await delay(500);
    }
  } finally {
    processing = false;
  }
}

async function summarizeOne(sessionId: number): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[insights-queue] skipping session summary: no API key');
    return;
  }
  const { model } = getSettings();
  try {
    const { getSessionById } = await import('../db');
    const session = getSessionById(sessionId);
    if (!session) return;
    if (session.summary) return;
    await summarizeSession(session, apiKey, model);
    console.log(`[insights-queue] summarized session ${sessionId}`);
  } catch (err) {
    console.log(
      `[insights-queue] failed to summarize session ${sessionId}:`,
      err,
    );
  }
}

export function backfillUnsummarized(): void {
  const sessions = getUnsummarizedSessions(50);
  for (const s of sessions) {
    if (!pending.includes(s.id)) {
      pending.push(s.id);
    }
  }
  void processQueue();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
