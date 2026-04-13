import { type EffectCallback, useEffect } from 'react';

// Escape hatch for the no-useEffect rule. Use only when synchronizing with an
// external system on mount (DOM APIs, third-party widgets, subscriptions).
export function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(effect, []);
}
