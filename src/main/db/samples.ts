import type Database from 'better-sqlite3';
import type { Category, Sample } from '../../shared/types';

export interface SampleStatements {
  insert: Database.Statement;
  getRange: Database.Statement;
  deleteAll: Database.Statement;
}

export function prepareSampleStatements(
  db: Database.Database,
): SampleStatements {
  return {
    insert: db.prepare(
      'INSERT INTO samples (ts, activity, category, confidence, focused_app, focused_window, open_windows) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    // open_windows is intentionally omitted: nothing in the renderer reads it,
    // and parsing it for every row of a day's worth of samples is wasted work.
    getRange: db.prepare(
      'SELECT id, ts, activity, category, confidence, focused_app, focused_window FROM samples WHERE ts >= ? AND ts < ? ORDER BY ts ASC',
    ),
    deleteAll: db.prepare('DELETE FROM samples'),
  };
}

export function insertSampleRow(
  stmts: SampleStatements,
  s: Omit<Sample, 'id'>,
): Sample {
  const r = stmts.insert.run(
    s.ts,
    s.activity,
    s.category,
    s.confidence,
    s.focusedApp,
    s.focusedWindow,
    JSON.stringify(s.openWindows),
  );
  return { id: Number(r.lastInsertRowid), ...s };
}

interface SampleRow {
  id: number;
  ts: number;
  activity: string;
  category: Category;
  confidence: number;
  focused_app: string | null;
  focused_window: string | null;
}

function rowToSample(row: SampleRow): Sample {
  return {
    id: row.id,
    ts: row.ts,
    activity: row.activity,
    category: row.category,
    confidence: row.confidence,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
    openWindows: [],
  };
}

export function getSamplesInRange(
  stmts: SampleStatements,
  rangeStart: number,
  rangeEnd: number,
): Sample[] {
  const rows = stmts.getRange.all(rangeStart, rangeEnd) as SampleRow[];
  return rows.map(rowToSample);
}
