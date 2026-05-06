import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import type { ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
// node:sqlite (built-in to Node 22+) avoids the better-sqlite3 ABI conflict —
// the slowblink Electron app rebuilds better-sqlite3 against Electron's Node
// ABI, which doesn't match system Node, so we'd otherwise get a runtime
// "compiled against a different Node.js version" error here.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { Connect } from 'vite';

interface DevCaptureRow {
  id: string;
  sample_id: number | null;
  captured_at: number;
  request_started_at: number | null;
  response_received_at: number | null;
  provider: string;
  model: string | null;
  outcome: 'success' | 'dlp_blocked' | 'error';
  error_message: string | null;
  focused_app: string | null;
  focused_window: string | null;
  image_size_bytes: number | null;
  request_json: string | null;
  response_json: string | null;
  parsed_result_json: string | null;
}

type DevCaptureListRow = Omit<
  DevCaptureRow,
  'request_json' | 'response_json' | 'parsed_result_json'
>;

const LIST_COLUMNS = `id, sample_id, captured_at, request_started_at, response_received_at,
       provider, model, outcome, error_message,
       focused_app, focused_window, image_size_bytes`;

function defaultUserDataDir(): string {
  // macOS: ~/Library/Application Support/slowblink
  // Linux: ~/.config/slowblink
  // Windows: %APPDATA%\slowblink
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'slowblink');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error('APPDATA not set');
    return join(appData, 'slowblink');
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdg, 'slowblink');
}

function resolveUserDataDir(): string {
  return process.env.SLOWBLINK_USER_DATA ?? defaultUserDataDir();
}

interface CachedStatements {
  db: DatabaseSync;
  listAll: StatementSync;
  listByOutcome: StatementSync;
  getById: StatementSync;
}

let cached: CachedStatements | null = null;

function getStmts(): CachedStatements {
  if (cached) return cached;
  const dbPath = join(resolveUserDataDir(), 'slowblink.db');
  if (!existsSync(dbPath)) {
    throw new Error(
      `slowblink DB not found at ${dbPath}. Run the Electron app first.`,
    );
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  cached = {
    db,
    listAll: db.prepare(
      `SELECT ${LIST_COLUMNS}
       FROM dev_captures
       WHERE captured_at < ?
       ORDER BY captured_at DESC
       LIMIT ?`,
    ),
    listByOutcome: db.prepare(
      `SELECT ${LIST_COLUMNS}
       FROM dev_captures
       WHERE captured_at < ? AND outcome = ?
       ORDER BY captured_at DESC
       LIMIT ?`,
    ),
    getById: db.prepare('SELECT * FROM dev_captures WHERE id = ?'),
  };
  return cached;
}

function getCapturesDir(): string {
  return join(resolveUserDataDir(), 'dev-captures');
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

function listCaptures(
  before: number,
  limit: number,
  outcome: string | null,
): DevCaptureListRow[] {
  const beforeTs = before > 0 ? before : Number.MAX_SAFE_INTEGER;
  const cappedLimit = Math.min(Math.max(limit, 1), 200);
  const stmts = getStmts();
  const rows = outcome
    ? stmts.listByOutcome.all(beforeTs, outcome, cappedLimit)
    : stmts.listAll.all(beforeTs, cappedLimit);
  return rows as unknown as DevCaptureListRow[];
}

function getCapture(id: string): DevCaptureRow | null {
  const row = getStmts().getById.get(id) as unknown as DevCaptureRow | undefined;
  return row ?? null;
}

function clearAll(): { rows: number; files: number } {
  // The viewer process opens the DB read-only, so we issue the actual writes
  // by re-opening with read-write semantics for the duration of this call.
  // The Electron app uses WAL — concurrent writes from another process are
  // safe. Closing the read-only connection first so we don't hold competing
  // file descriptors.
  if (cached) {
    cached.db.close();
    cached = null;
  }
  const dbPath = join(resolveUserDataDir(), 'slowblink.db');
  const writeDb = new DatabaseSync(dbPath);
  const dropped = writeDb.prepare('DELETE FROM dev_captures').run();
  writeDb.close();

  const dir = getCapturesDir();
  let unlinkedCount = 0;
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.jpg')) {
        try {
          unlinkSync(join(dir, f));
          unlinkedCount += 1;
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // dir may not exist; ignore
  }
  return { rows: Number(dropped.changes), files: unlinkedCount };
}

function parseListQuery(url: string): {
  before: number;
  limit: number;
  outcome: string | null;
} {
  const params = new URL(url, 'http://localhost').searchParams;
  const before = Number(params.get('before') ?? '0') || 0;
  const limit = Number(params.get('limit') ?? '50') || 50;
  const outcomeParam = params.get('outcome');
  const outcome =
    outcomeParam && ['success', 'dlp_blocked', 'error'].includes(outcomeParam)
      ? outcomeParam
      : null;
  return { before, limit, outcome };
}

function handleListCaptures(res: ServerResponse, url: string): void {
  const { before, limit, outcome } = parseListQuery(url);
  jsonResponse(res, 200, { captures: listCaptures(before, limit, outcome) });
}

function handleGetCapture(res: ServerResponse, id: string): void {
  const row = getCapture(id);
  if (!row) {
    jsonResponse(res, 404, { error: 'not found' });
    return;
  }
  jsonResponse(res, 200, {
    capture: {
      ...row,
      request: row.request_json ? safeParse(row.request_json) : null,
      response: row.response_json ? safeParse(row.response_json) : null,
      parsed_result: row.parsed_result_json
        ? safeParse(row.parsed_result_json)
        : null,
    },
  });
}

function handleServeImage(res: ServerResponse, id: string): void {
  const path = join(getCapturesDir(), `${id}.jpg`);
  try {
    const buf = readFileSync(path);
    res.writeHead(200, {
      'content-type': 'image/jpeg',
      'cache-control': 'no-cache',
      'content-length': String(buf.length),
    });
    res.end(buf);
  } catch {
    res.writeHead(404).end();
  }
}

interface RouteDef {
  method: 'GET' | 'POST';
  pattern: RegExp;
  handle: (res: ServerResponse, match: RegExpMatchArray, url: string) => void;
}

const ROUTES: RouteDef[] = [
  {
    method: 'GET',
    pattern: /^\/api\/captures\?/,
    handle: (res, _m, url) => handleListCaptures(res, url),
  },
  {
    method: 'GET',
    pattern: /^\/api\/captures\/([\w-]+)$/,
    handle: (res, m) => handleGetCapture(res, m[1] ?? ''),
  },
  {
    method: 'POST',
    pattern: /^\/api\/clear$/,
    handle: (res) => jsonResponse(res, 200, clearAll()),
  },
  {
    method: 'GET',
    pattern: /^\/captures\/([\w-]+)\.jpg$/,
    handle: (res, m) => handleServeImage(res, m[1] ?? ''),
  },
];

function findRoute(
  method: string | undefined,
  url: string,
): {
  def: RouteDef;
  match: RegExpMatchArray;
} | null {
  for (const def of ROUTES) {
    if (method !== def.method) continue;
    const match = url.match(def.pattern);
    if (match) return { def, match };
  }
  return null;
}

export function devCapturesMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? '';
    const found = findRoute(req.method, url);
    if (!found) return next();
    try {
      found.def.handle(res, found.match, url);
    } catch (err) {
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
