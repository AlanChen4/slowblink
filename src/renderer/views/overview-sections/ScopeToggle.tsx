import type { OverviewScope, Plan, Settings } from '@shared/types';

interface Props {
  scope: OverviewScope;
  settings: Settings;
  plan: Plan | null;
  onChange: (scope: OverviewScope) => void;
}

function canUseAllDevices(settings: Settings, plan: Plan | null): boolean {
  return plan?.tier === 'paid' && settings.storageMode === 'cloud-sync';
}

export function ScopeToggle({ scope, settings, plan, onChange }: Props) {
  if (!canUseAllDevices(settings, plan)) return null;
  const options: { id: OverviewScope; label: string }[] = [
    { id: 'this-device', label: 'This device' },
    { id: 'all-devices', label: 'All devices' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Overview scope"
      className="inline-flex rounded-md border border-input bg-background p-0.5"
    >
      {options.map((opt) => {
        const active = scope === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={
              active
                ? 'rounded-sm bg-secondary px-3 py-1 font-medium text-secondary-foreground text-xs'
                : 'rounded-sm px-3 py-1 text-muted-foreground text-xs hover:text-foreground'
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
