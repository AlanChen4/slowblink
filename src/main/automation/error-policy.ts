export interface ErrorState {
  lastError: string | null;
  autoPaused: string | null;
  consecutiveErrors: number;
}

// Node/Electron's fetch throws a bare `TypeError: fetch failed` and tucks the
// real reason (DNS, TCP, TLS) into `err.cause`. Walk the chain so the message
// surfaced to the user is actionable rather than generic.
export function formatRunnerError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cur: Error | undefined = err;
  const seen = new Set<unknown>([err]);
  while (cur) {
    const cause = (cur as Error & { cause?: unknown }).cause;
    if (!(cause instanceof Error) || seen.has(cause)) break;
    parts.push(cause.message);
    seen.add(cause);
    cur = cause;
  }
  const unique = Array.from(new Set(parts));
  return unique.length === 1 ? unique[0] : `${unique[0]} — ${unique.slice(1).join(' — ')}`;
}

export interface ErrorTracker {
  recordFailure(msg: string): void;
  clearFailures(): void;
  getState(): ErrorState;
}

export function createErrorTracker(opts: { threshold: number }): ErrorTracker {
  let lastError: string | null = null;
  let consecutiveErrors = 0;
  let autoPaused: string | null = null;

  return {
    recordFailure(msg: string) {
      lastError = msg;
      consecutiveErrors += 1;
      if (consecutiveErrors >= opts.threshold) {
        autoPaused = msg;
      }
    },
    clearFailures() {
      lastError = null;
      consecutiveErrors = 0;
      autoPaused = null;
    },
    getState() {
      return { lastError, autoPaused, consecutiveErrors };
    },
  };
}
