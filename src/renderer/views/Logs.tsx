import type { Sample } from '@shared/types';
import { useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { startOfDay } from '@/lib/categories';

export function Logs() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [dayStart] = useState(() => startOfDay());

  useMountEffect(() => {
    let lastSeenId: number | null = null;
    let lastSeenLength = 0;
    const refresh = async () => {
      const next = await window.slowblink.getSamples(dayStart, Date.now());
      const newest = next.length > 0 ? next[next.length - 1].id : null;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="font-semibold text-lg">Logs</h2>
      <div className="mt-4">
        {samples.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No samples yet. Make sure permissions and API key are set, then wait
            for the first capture.
          </p>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
            {samples
              .slice(-50)
              .reverse()
              .map((s) => (
                <div key={s.id} className="flex items-center gap-3">
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
        )}
      </div>
    </div>
  );
}
