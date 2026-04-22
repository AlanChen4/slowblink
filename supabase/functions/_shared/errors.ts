// Shared error types + JSON response helpers.
// Edge functions throw these and the top-level handler maps them to HTTP codes.

import { corsHeaders } from './cors.ts';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function jsonError(status: number, code: string, message?: string): Response {
  return jsonResponse({ error: code, message: message ?? code }, status);
}

// Map known error classes to HTTP status codes. Use at the top of each
// function's handler inside a try/catch to keep bodies consistent.
export function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) return jsonError(401, 'unauthorized', err.message);
  if (err instanceof PlanError) return jsonError(402, 'plan_required', err.message);
  if (err instanceof ValidationError) return jsonError(400, 'bad_request', err.message);
  if (err instanceof RateLimitError) return jsonError(429, 'rate_limited', err.message);
  const message = err instanceof Error ? err.message : 'unknown';
  console.error('unhandled edge function error:', err);
  return jsonError(500, 'internal_error', message);
}
