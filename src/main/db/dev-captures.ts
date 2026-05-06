import type Database from 'better-sqlite3';

export type CaptureOutcome = 'success' | 'dlp_blocked' | 'error';

export interface DevCaptureRow {
  id: string;
  sample_id: number | null;
  captured_at: number;
  request_started_at: number | null;
  response_received_at: number | null;
  provider: string;
  model: string | null;
  outcome: CaptureOutcome;
  error_message: string | null;
  focused_app: string | null;
  focused_window: string | null;
  image_size_bytes: number | null;
  request_json: string | null;
  response_json: string | null;
  parsed_result_json: string | null;
}

export interface DevCapturesStatements {
  insert: Database.Statement;
  selectAllIds: Database.Statement;
  deleteByIds: Database.Statement;
}

export function prepareDevCapturesStatements(
  db: Database.Database,
): DevCapturesStatements {
  return {
    insert: db.prepare(
      `INSERT INTO dev_captures (
         id, sample_id, captured_at, request_started_at, response_received_at,
         provider, model, outcome, error_message,
         focused_app, focused_window, image_size_bytes,
         request_json, response_json, parsed_result_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    selectAllIds: db.prepare(`SELECT id FROM dev_captures`),
    deleteByIds: db.prepare(
      `DELETE FROM dev_captures WHERE id IN (SELECT value FROM json_each(?))`,
    ),
  };
}

export function insertCapture(
  stmts: DevCapturesStatements,
  row: DevCaptureRow,
): void {
  stmts.insert.run(
    row.id,
    row.sample_id,
    row.captured_at,
    row.request_started_at,
    row.response_received_at,
    row.provider,
    row.model,
    row.outcome,
    row.error_message,
    row.focused_app,
    row.focused_window,
    row.image_size_bytes,
    row.request_json,
    row.response_json,
    row.parsed_result_json,
  );
}

export function listAllCaptureIds(stmts: DevCapturesStatements): string[] {
  const rows = stmts.selectAllIds.all() as { id: string }[];
  return rows.map((r) => r.id);
}

export function deleteCapturesByIds(
  stmts: DevCapturesStatements,
  ids: string[],
): void {
  if (ids.length === 0) return;
  stmts.deleteByIds.run(JSON.stringify(ids));
}

export interface OrphanReconciliation {
  filesToUnlink: string[]; // jpeg ids on disk with no matching row
  rowsToDelete: string[]; // row ids with no matching jpeg
}

export function reconcileOrphans(
  fileIds: Iterable<string>,
  rowIds: Iterable<string>,
): OrphanReconciliation {
  const files = new Set(fileIds);
  const rows = new Set(rowIds);
  const filesToUnlink: string[] = [];
  for (const f of files) {
    if (!rows.has(f)) filesToUnlink.push(f);
  }
  const rowsToDelete: string[] = [];
  for (const r of rows) {
    if (!files.has(r)) rowsToDelete.push(r);
  }
  return { filesToUnlink, rowsToDelete };
}
