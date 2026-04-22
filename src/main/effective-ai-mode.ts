import type { AIMode, AuthSession, Plan } from '../shared/types';

export function effectiveAiMode(
  stored: AIMode,
  session: AuthSession | null,
  plan: Plan,
): AIMode {
  if (stored !== 'cloud-ai') return stored;
  if (!session || plan.tier !== 'paid') return 'byo-key';
  return 'cloud-ai';
}
