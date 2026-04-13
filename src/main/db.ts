import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { Category, Sample } from '../shared/types';

interface DbHandles {
  db: Database.Database;
  insertSampleStmt: Database.Statement;
  getSamplesStmt: Database.Statement;
}

let handles: DbHandles | null = null;

export function initDb() {
  const path = join(app.getPath('userData'), 'slowblink.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      activity TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL,
      focused_app TEXT,
      focused_window TEXT,
      open_windows TEXT
    );
    CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts);
  `);

  handles = {
    db,
    insertSampleStmt: db.prepare(
      'INSERT INTO samples (ts, activity, category, confidence, focused_app, focused_window, open_windows) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    // open_windows is intentionally omitted: nothing in the renderer reads it,
    // and parsing it for every row of a day's worth of samples is wasted work.
    getSamplesStmt: db.prepare(
      'SELECT id, ts, activity, category, confidence, focused_app, focused_window FROM samples WHERE ts >= ? AND ts < ? ORDER BY ts ASC',
    ),
  };
}

function requireDb(): DbHandles {
  if (!handles)
    throw new Error('database not initialized; call initDb() first');
  return handles;
}

export function insertSample(s: Omit<Sample, 'id'>): Sample {
  const r = requireDb().insertSampleStmt.run(
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

export function getSamples(rangeStart: number, rangeEnd: number): Sample[] {
  const rows = requireDb().getSamplesStmt.all(
    rangeStart,
    rangeEnd,
  ) as SampleRow[];
  return rows.map(rowToSample);
}

export function deleteAll() {
  requireDb().db.exec('DELETE FROM samples;');
}
