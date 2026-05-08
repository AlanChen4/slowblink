import type { OverviewAggregate } from '../../shared/types';

export function mergeIconsIntoAggregate(
  agg: OverviewAggregate,
  local: Map<string, { dataUrl: string; updatedAt: number }>,
  remote: Map<string, string>,
): OverviewAggregate {
  return {
    apps: agg.apps.map((a) => ({
      ...a,
      iconDataUrl: local.get(a.app)?.dataUrl ?? remote.get(a.app) ?? null,
    })),
  };
}
