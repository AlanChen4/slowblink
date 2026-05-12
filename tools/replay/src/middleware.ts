import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
// node:sqlite (built-in to Node 22+) avoids the better-sqlite3 ABI conflict —
// the slowblink Electron app rebuilds better-sqlite3 against Electron's Node
// ABI, which doesn't match system Node, so we'd otherwise get a runtime
// "compiled against a different Node.js version" error here.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
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
  const row = getStmts().getById.get(id) as unknown as
    | DevCaptureRow
    | undefined;
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

const FIXTURE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function resolveFixturesDir(): string {
  // tools/replay/src/middleware.ts → repo root → fixtures/
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../fixtures');
}

interface FixtureRow {
  name: string;
  samples: number;
  sizeBytes: number;
  mtime: number;
}

interface FixtureSample {
  ts: number;
  activity: string;
  confidence: number | null;
  focused_app: string | null;
  focused_window: string | null;
}

interface FixtureFile {
  samples?: FixtureSample[];
}

function readFixtureSamples(path: string): FixtureSample[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as FixtureSample[] | FixtureFile;
  return Array.isArray(parsed) ? parsed : (parsed.samples ?? []);
}

function listFixtures(): FixtureRow[] {
  const dir = resolveFixturesDir();
  if (!existsSync(dir)) return [];
  const rows: FixtureRow[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    let sampleCount = 0;
    try {
      sampleCount = readFixtureSamples(fullPath).length;
    } catch {
      // Skip malformed JSON — still list the file so the user sees it.
    }
    rows.push({
      name: entry,
      samples: sampleCount,
      sizeBytes: stat.size,
      mtime: stat.mtimeMs,
    });
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows;
}

function handleListFixtures(res: ServerResponse): void {
  jsonResponse(res, 200, { fixtures: listFixtures() });
}

function fixturePath(name: string): string | null {
  if (!FIXTURE_NAME_RE.test(name)) return null;
  if (!name.endsWith('.json')) return null;
  return join(resolveFixturesDir(), name);
}

function handleReadFixture(res: ServerResponse, name: string): void {
  const path = fixturePath(name);
  if (!path || !existsSync(path)) {
    jsonResponse(res, 404, { error: 'fixture not found' });
    return;
  }
  try {
    const samples = readFixtureSamples(path);
    jsonResponse(res, 200, { name, samples });
  } catch (err) {
    jsonResponse(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

interface WriteFixtureBody {
  name?: unknown;
  samples?: unknown;
}

function isFixtureSample(v: unknown): v is FixtureSample {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.ts === 'number' && typeof o.activity === 'string';
}

async function handleWriteFixture(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(req)) as WriteFixtureBody | null;
  if (!body || typeof body.name !== 'string' || !Array.isArray(body.samples)) {
    jsonResponse(res, 400, { error: 'invalid body' });
    return;
  }
  const name = body.name.endsWith('.json') ? body.name : `${body.name}.json`;
  const path = fixturePath(name);
  if (!path) {
    jsonResponse(res, 400, { error: 'invalid fixture name' });
    return;
  }
  if (!body.samples.every(isFixtureSample)) {
    jsonResponse(res, 400, { error: 'invalid samples shape' });
    return;
  }
  const dir = resolveFixturesDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(body.samples, null, 2)}\n`);
  jsonResponse(res, 200, { name });
}

interface RouteDef {
  method: 'GET' | 'POST';
  pattern: RegExp;
  handle: (
    req: IncomingMessage,
    res: ServerResponse,
    match: RegExpMatchArray,
    url: string,
  ) => void | Promise<void>;
}

const ROUTES: RouteDef[] = [
  {
    method: 'GET',
    pattern: /^\/api\/captures\?/,
    handle: (_req, res, _m, url) => handleListCaptures(res, url),
  },
  {
    method: 'GET',
    pattern: /^\/api\/captures\/([\w-]+)$/,
    handle: (_req, res, m) => handleGetCapture(res, m[1] ?? ''),
  },
  {
    method: 'POST',
    pattern: /^\/api\/clear$/,
    handle: (_req, res) => jsonResponse(res, 200, clearAll()),
  },
  {
    method: 'GET',
    pattern: /^\/api\/fixtures$/,
    handle: (_req, res) => handleListFixtures(res),
  },
  {
    method: 'GET',
    pattern: /^\/api\/fixtures\/([\w.-]+)$/,
    handle: (_req, res, m) => handleReadFixture(res, m[1] ?? ''),
  },
  {
    method: 'POST',
    pattern: /^\/api\/fixtures$/,
    handle: (req, res) => handleWriteFixture(req, res),
  },
  {
    method: 'GET',
    pattern: /^\/captures\/([\w-]+)\.jpg$/,
    handle: (_req, res, m) => handleServeImage(res, m[1] ?? ''),
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
      const result = found.def.handle(req, res, found.match, url);
      if (result instanceof Promise) {
        result.catch((err) => {
          jsonResponse(res, 500, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
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
