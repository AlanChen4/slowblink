import { readFileSync } from 'node:fs';
import type { Sample } from '../../../../shared/types';

export interface RawFixtureSample {
  ts: number;
  activity: string;
  confidence: number;
  focused_app: string | null;
  focused_window: string | null;
}

export function loadFixtureSamples(path: string): Sample[] {
  const raw = readFileSync(path, 'utf8');
  const rows = JSON.parse(raw) as RawFixtureSample[];
  return rows.map((r, i) => ({
    id: i + 1,
    ts: r.ts,
    activity: r.activity,
    confidence: r.confidence,
    focusedApp: r.focused_app,
    focusedWindow: r.focused_window,
  }));
}
