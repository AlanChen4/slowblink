export interface ErrorState {
  lastError: string | null;
  autoPaused: string | null;
  consecutiveErrors: number;
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
