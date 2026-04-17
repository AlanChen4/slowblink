import type { Plan } from '../../shared/types';
import { onSessionChange } from '../auth/session';
import { cloudAuthHeaders, cloudEndpoint } from '../cloud/endpoint';
import { createEmitter } from '../emitter';
import { getPlanCache, setPlanCache } from '../settings';

const DEFAULT_PLAN: Plan = { tier: 'free', renewsAt: null };

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

export async function refreshPlan(): Promise<Plan> {
  const url = cloudEndpoint('plan', 'plan');
  if (!url) {
    setPlan(DEFAULT_PLAN);
    return DEFAULT_PLAN;
  }
  try {
    const res = await fetch(url, { headers: cloudAuthHeaders() });
    if (!res.ok) {
      console.log('[billing] plan fetch failed:', res.status);
      return current;
    }
    const data = (await res.json()) as Plan;
    setPlan({
      tier: data.tier === 'paid' ? 'paid' : 'free',
      renewsAt: typeof data.renewsAt === 'number' ? data.renewsAt : null,
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
