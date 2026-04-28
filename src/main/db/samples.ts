import type Database from 'better-sqlite3';
import type { Sample } from '../../shared/types';

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
      'INSERT INTO samples (ts, activity, confidence, focused_app, focused_window) VALUES (?, ?, ?, ?, ?)',
    ),
    getRange: db.prepare(
      'SELECT id, ts, activity, confidence, focused_app, focused_window FROM samples WHERE ts >= ? AND ts < ? ORDER BY ts ASC',
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
    s.confidence,
    s.focusedApp,
    s.focusedWindow,
  );
  return { id: Number(r.lastInsertRowid), ...s };
}

interface SampleRow {
  id: number;
  ts: number;
  activity: string;
  confidence: number;
  focused_app: string | null;
  focused_window: string | null;
}

function rowToSample(row: SampleRow): Sample {
  return {
    id: row.id,
    ts: row.ts,
    activity: row.activity,
    confidence: row.confidence,
    focusedApp: row.focused_app,
    focusedWindow: row.focused_window,
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
