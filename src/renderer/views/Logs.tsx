import type { Sample } from '@shared/types';
import { useState } from 'react';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { startOfDay } from '@/lib/categories';

export function Logs() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [dayStart] = useState(() => startOfDay());

  useMountEffect(() => {
    const cancel = { value: false };
    const refresh = async () => {
      const next = await window.slowblink.getSamples(dayStart, Date.now());
      if (cancel.value) return;
      setSamples(next);
      const names = Array.from(
        new Set(
          next
            .map((s) => s.focusedApp)
            .filter((n): n is string => n !== null && n !== ''),
        ),
      );
      if (names.length > 0) {
        const fetched = await window.slowblink.getAppIcons(names);
        if (cancel.value) return;
        setIcons((prev) => ({ ...prev, ...fetched }));
      }
    };
    void refresh();
    const unsubscribe = window.slowblink.onSampleInserted((sample) => {
      if (cancel.value) return;
      if (sample.ts < dayStart) return;
      void refresh();
    });
    return () => {
      cancel.value = true;
      unsubscribe();
    };
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
              .map((s) => {
                const iconUrl = s.focusedApp ? icons[s.focusedApp] : null;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                      {new Date(s.ts).toLocaleTimeString()}
                    </span>
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt=""
                          className="size-4 shrink-0 rounded-sm"
                        />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate">
                        {s.focusedApp ?? '—'}
                      </span>
                    </span>
                    <span className="min-w-0 truncate">{s.activity}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
