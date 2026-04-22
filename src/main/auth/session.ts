import type { Session } from '@supabase/supabase-js';
import type { AuthSession } from '../../shared/types';
import { createEmitter } from '../emitter';
import { getStoredSession, setStoredSession } from '../settings';
import { getSupabase } from './client';

const sessionEmitter = createEmitter<AuthSession | null>();
export const onSessionChange = sessionEmitter.on;

let currentSession: Session | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

function toPublic(session: Session | null): AuthSession | null {
  if (!session?.user?.email) return null;
  return {
    user: { id: session.user.id, email: session.user.email },
    expiresAt: (session.expires_at ?? 0) * 1000,
  };
}

function scheduleRefresh(session: Session | null) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!session?.expires_at) return;
  // Refresh 60 seconds before expiry, but never sooner than 30s out.
  const msUntilRefresh = Math.max(
    session.expires_at * 1000 - Date.now() - 60_000,
    30_000,
  );
  refreshTimer = setTimeout(() => void refreshSession(), msUntilRefresh);
}

function persist(session: Session | null) {
  currentSession = session;
  setStoredSession(session ? JSON.stringify(session) : null);
  scheduleRefresh(session);
  sessionEmitter.emit(toPublic(session));
}

export async function loadSessionFromDisk() {
  const json = getStoredSession();
  if (!json) {
    sessionEmitter.emit(null);
    return;
  }
  try {
    const parsed = JSON.parse(json) as Partial<Session> | null;
    if (
      !parsed ||
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      !parsed.access_token ||
      !parsed.refresh_token
    ) {
      console.log('[auth] stored session failed shape check, clearing');
      persist(null);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      sessionEmitter.emit(null);
      return;
    }
    const { error } = await sb.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) {
      console.log('[auth] failed to restore session:', error.message);
      persist(null);
      return;
    }
    const { data } = await sb.auth.getSession();
    persist(data.session ?? null);
  } catch (err) {
    console.log('[auth] session restore threw:', err);
    persist(null);
  }
}

async function refreshSession() {
  const sb = getSupabase();
  if (!sb || !currentSession) return;
  const { data, error } = await sb.auth.refreshSession({
    refresh_token: currentSession.refresh_token,
  });
  if (error) {
    console.log('[auth] refresh failed, clearing session:', error.message);
    persist(null);
    return;
  }
  persist(data.session ?? null);
}

export function getCurrentSession(): AuthSession | null {
  return toPublic(currentSession);
}

export function getAccessToken(): string | null {
  return currentSession?.access_token ?? null;
}

export async function completeOAuthCallback(code: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) throw new Error(`Auth callback failed: ${error.message}`);
  persist(data.session ?? null);
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut().catch(() => undefined);
  persist(null);
}
