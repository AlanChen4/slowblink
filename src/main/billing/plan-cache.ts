import type { Plan } from '../../shared/types';
import { getSupabase } from '../auth/client';
import { getCurrentSession, onSessionChange } from '../auth/session';
import { createEmitter } from '../emitter';
import { getPlanCache, setPlanCache } from '../settings';

const DEFAULT_PLAN: Plan = { tier: 'free', renewsAt: null };
const PLAN_FETCH_TIMEOUT_MS = 5_000;

const planEmitter = createEmitter<Plan>();
export const onPlanChange = planEmitter.on;

let current: Plan = DEFAULT_PLAN;

export function getPlan(): Plan {
  return current;
}

function setPlan(next: Plan) {
  current = next;
  setPlanCache(next);
  planEmitter.emit(next);
}

// Reads the caller's own row from public.profiles through the JS SDK. RLS
// policy `profiles_self_select` restricts the result to their own id. No
// dedicated /plan edge function — the tier is already on profiles and the
// webhook (stripe-webhook) is the source of truth for updates.
export async function refreshPlan(): Promise<Plan> {
  const sb = getSupabase();
  const session = getCurrentSession();
  if (!sb || !session) {
    setPlan(DEFAULT_PLAN);
    return DEFAULT_PLAN;
  }
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('tier, renews_at')
      .eq('id', session.user.id)
      .abortSignal(AbortSignal.timeout(PLAN_FETCH_TIMEOUT_MS))
      .maybeSingle();
    if (error) {
      console.log('[billing] plan fetch failed:', error.message);
      return current;
    }
    const tier = data?.tier === 'paid' ? 'paid' : 'free';
    const parsedRenewsAt = data?.renews_at ? Date.parse(data.renews_at) : NaN;
    setPlan({
      tier,
      renewsAt: Number.isFinite(parsedRenewsAt) ? parsedRenewsAt : null,
    });
    return current;
  } catch (err) {
    console.log('[billing] plan fetch threw:', err);
    return current;
  }
}

export function initPlanCache() {
  current = getPlanCache() ?? DEFAULT_PLAN;
  onSessionChange((session) => {
    if (session) {
      void refreshPlan();
    } else {
      setPlan(DEFAULT_PLAN);
    }
  });
}
