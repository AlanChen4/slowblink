interface Props {
  value: number;
  onChange: (next: number) => void;
}

const OPTIONS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
];

export function MinDurationControl({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      {OPTIONS.map((opt) => {
        const active = value === opt.ms;
        return (
          <button
            key={opt.ms}
            type="button"
            onClick={() => onChange(opt.ms)}
            className={
              active
                ? 'rounded bg-primary px-2 py-1 font-medium text-primary-foreground text-xs'
                : 'rounded px-2 py-1 text-muted-foreground text-xs hover:bg-accent'
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
