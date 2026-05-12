import { format } from 'node:util';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  message: string;
}

const LOG_BUFFER_SIZE = 500;

const buffer: LogEntry[] = [];
let nextId = 1;

function streamFor(level: LogLevel): NodeJS.WriteStream {
  return level === 'error' || level === 'warn'
    ? process.stderr
    : process.stdout;
}

function safeWrite(stream: NodeJS.WriteStream, line: string): void {
  if (!stream.writable) return;
  try {
    stream.write(line);
  } catch {
    // The pipe was torn down between the `writable` check and the write —
    // nothing left to do. The ring buffer still has the entry.
  }
}

function record(level: LogLevel, args: unknown[]): void {
  const message = format(...args);
  const entry: LogEntry = { id: nextId++, ts: Date.now(), level, message };
  buffer.push(entry);
  if (buffer.length > LOG_BUFFER_SIZE) buffer.shift();
  safeWrite(streamFor(level), `${message}\n`);
}

export const logger = {
  log: (...args: unknown[]) => record('log', args),
  info: (...args: unknown[]) => record('info', args),
  warn: (...args: unknown[]) => record('warn', args),
  error: (...args: unknown[]) => record('error', args),
  debug: (...args: unknown[]) => record('debug', args),
};

export function getLogBuffer(): LogEntry[] {
  return buffer.slice();
}

export function installStdioSafetyNet(): void {
  process.stdout.on('error', handlePipeError);
  process.stderr.on('error', handlePipeError);
  process.on('uncaughtException', handlePipeError);
}

function handlePipeError(err: NodeJS.ErrnoException): void {
  if (
    err.code === 'EPIPE' ||
    err.code === 'EBADF' ||
    err.code === 'ERR_STREAM_DESTROYED'
  ) {
    return;
  }
  // Anything else: replicate Node's default uncaught behavior. We
  // intentionally bypass `logger` here — this may run before init.
  if (process.stderr.writable) {
    try {
      process.stderr.write(`${err.stack ?? err.message ?? String(err)}\n`);
    } catch {
      // stderr also gone — nothing useful to do.
    }
  }
  process.exit(1);
}
