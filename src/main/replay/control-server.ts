import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { app } from 'electron';
import type { OverviewScope } from '../../shared/types';
import type { Automation } from '../automation';
import { getLogBuffer, logger } from '../logger';
import { getOverviewDebug } from '../overview/debug';

const HOST = '127.0.0.1';
const PORT = 5175;
const ALLOWED_ORIGIN = 'http://localhost:5174';

export interface ControlServerDeps {
  automation: Automation;
}

export interface ControlServer {
  start(): void;
  stop(): Promise<void>;
}

function setCors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', ALLOWED_ORIGIN);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  setCors(res);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

async function handleCapture(
  res: ServerResponse,
  automation: Automation,
): Promise<void> {
  try {
    await automation.captureNow();
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 500, { error: message });
  }
}

function parseScope(raw: string | null): OverviewScope | null {
  if (raw === 'this-device' || raw === 'all-devices') return raw;
  return null;
}

async function handleOverviewDebug(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const start = Number(url.searchParams.get('start'));
  const end = Number(url.searchParams.get('end'));
  const scope = parseScope(url.searchParams.get('scope'));
  if (!Number.isFinite(start) || !Number.isFinite(end) || !scope) {
    jsonResponse(res, 400, { error: 'invalid-range' });
    return;
  }
  try {
    const debug = await getOverviewDebug(start, end, scope);
    jsonResponse(res, 200, debug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 500, { error: message });
  }
}

interface Route {
  method: 'GET' | 'POST';
  path: string;
  handle: (res: ServerResponse, url: URL, deps: ControlServerDeps) => void;
}

const ROUTES: Route[] = [
  {
    method: 'POST',
    path: '/capture',
    handle: (res, _u, deps) => {
      void handleCapture(res, deps.automation);
    },
  },
  {
    method: 'GET',
    path: '/status',
    handle: (res, _u, deps) => {
      jsonResponse(res, 200, deps.automation.getState().status);
    },
  },
  {
    method: 'GET',
    path: '/logs',
    handle: (res) => {
      jsonResponse(res, 200, { entries: getLogBuffer() });
    },
  },
  {
    method: 'GET',
    path: '/overview-debug',
    handle: (res, url) => {
      void handleOverviewDebug(res, url);
    },
  },
];

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ControlServerDeps,
): void {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const route = ROUTES.find(
    (r) => r.method === req.method && r.path === url.pathname,
  );
  if (!route) {
    jsonResponse(res, 404, { error: 'not-found' });
    return;
  }
  route.handle(res, url, deps);
}

export function createControlServer(deps: ControlServerDeps): ControlServer {
  let server: Server | null = null;

  function start(): void {
    if (app.isPackaged) return;
    if (server) return;
    server = createServer((req, res) => handleRequest(req, res, deps));
    server.on('error', (err) => {
      logger.error('[replay control] server error:', err);
    });
    server.listen(PORT, HOST, () => {
      logger.log(`[replay control] listening on http://${HOST}:${PORT}`);
    });
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      const s = server;
      server = null;
      s.close(() => resolve());
    });
  }

  return { start, stop };
}
