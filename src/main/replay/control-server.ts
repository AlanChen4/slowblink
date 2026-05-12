import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { app } from 'electron';
import type { Automation } from '../automation';
import { logger } from '../logger';
import { isReplayLoggingEnabled } from '../settings';

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
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
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
  if (!isReplayLoggingEnabled()) {
    jsonResponse(res, 409, { error: 'replay-logging-off' });
    return;
  }
  try {
    await automation.captureNow();
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, 500, { error: message });
  }
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ControlServerDeps,
): void {
  if (req.url !== '/capture') {
    jsonResponse(res, 404, { error: 'not-found' });
    return;
  }
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'POST') {
    void handleCapture(res, deps.automation);
    return;
  }
  jsonResponse(res, 405, { error: 'method-not-allowed' });
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
