import type { Sample } from '@shared/types';
import { useMemo, useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { CATEGORY_COLORS, startOfDay } from '@/lib/categories';

const GRANULARITIES = [
  { label: '1 min', ms: 60_000 },
  { label: '5 min', ms: 5 * 60_000 },
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
];

export function Timeline() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [granIdx, setGranIdx] = useState(2);
  const [dayStart] = useState(() => startOfDay());

  useMountEffect(() => {
    let lastSeenId: number | null = null;
    let lastSeenLength = 0;
    const refresh = async () => {
      const next = await window.slowblink.getSamples(dayStart, Date.now());
      const newest = next.length > 0 ? next[next.length - 1].id : null;
      // Skip the state update when nothing changed so the bucket memo and the
      // 288-row timeline don't re-render every 5s for no reason.
      if (next.length === lastSeenLength && newest === lastSeenId) return;
      lastSeenLength = next.length;
      lastSeenId = newest;
      setSamples(next);
    };
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 5_000);
    return () => clearInterval(t);
  });

  const buckets = useMemo(() => {
    const ms = GRANULARITIES[granIdx].ms;
    const count = Math.ceil((24 * 60 * 60_000) / ms);
    const arr: { start: number; samples: Sample[] }[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({ start: dayStart + i * ms, samples: [] });
    }
    for (const s of samples) {
      const i = Math.floor((s.ts - dayStart) / ms);
      if (arr[i]) arr[i].samples.push(s);
    }
    return arr;
  }, [samples, granIdx, dayStart]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Today</h2>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Granularity</span>
          <select
            value={granIdx}
            onChange={(e) => setGranIdx(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {GRANULARITIES.map((g, i) => (
              <option key={g.label} value={i}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        {samples.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No samples yet. Make sure permissions and API key are set, then wait
            for the first capture.
          </p>
        ) : (
          <div className="flex h-16 w-full overflow-hidden rounded border border-border">
            {buckets.map((b) => {
              const dominant = dominantCategory(b.samples);
              const color = dominant
                ? CATEGORY_COLORS[dominant]
                : 'bg-transparent';
              const tooltip = b.samples
                .slice(0, 5)
                .map(
                  (s) =>
                    `${new Date(s.ts).toLocaleTimeString()} — ${s.activity}`,
                )
                .join('\n');
              return (
                <div
                  key={b.start}
                  className={`flex-1 ${color} border-background/20 border-r`}
                  title={tooltip || new Date(b.start).toLocaleTimeString()}
                />
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-3 rounded-full ${color}`} />
              <span className="text-muted-foreground">{cat}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {samples
            .slice(-50)
            .reverse()
            .map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span
                  className={`size-3 shrink-0 rounded-full ${CATEGORY_COLORS[s.category]}`}
                />
                <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                  {new Date(s.ts).toLocaleTimeString()}
                </span>
                <span className="w-24 shrink-0 truncate text-muted-foreground">
                  {s.focusedApp ?? '—'}
                </span>
                <span className="min-w-0 truncate">{s.activity}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function dominantCategory(samples: Sample[]): Sample['category'] | null {
  if (samples.length === 0) return null;
  const counts = new Map<Sample['category'], number>();
  let best: Sample['category'] | null = null;
  let bestCount = 0;
  for (const s of samples) {
    const n = (counts.get(s.category) ?? 0) + 1;
    counts.set(s.category, n);
    if (n > bestCount) {
      bestCount = n;
      best = s.category;
    }
  }
  return best;
}
