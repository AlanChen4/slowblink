import type { Settings } from '@shared/types';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const INTERVAL_PRESETS_SEC = [5, 10, 30, 60, 300, 900] as const;
const CUSTOM_VALUE = 'custom';

function formatPreset(sec: number): string {
  if (sec < 60) return `${sec} seconds`;
  if (sec === 60) return '1 minute';
  return `${sec / 60} minutes`;
}

export function CaptureSection({ settings }: { settings: Settings }) {
  const initialSec = Math.round(settings.intervalMs / 1000);
  const initialIsPreset = (INTERVAL_PRESETS_SEC as readonly number[]).includes(
    initialSec,
  );
  const [selected, setSelected] = useState<string>(
    initialIsPreset ? String(initialSec) : CUSTOM_VALUE,
  );
  const [customSec, setCustomSec] = useState<number>(initialSec);
  const [model, setModel] = useState(settings.model);

  async function saveInterval(sec: number) {
    const safe = Math.max(1, Math.round(sec));
    const nextMs = safe * 1000;
    if (nextMs === settings.intervalMs) return;
    await window.slowblink.setSettings({ intervalMs: nextMs });
  }

  function onIntervalSelect(value: string) {
    setSelected(value);
    if (value === CUSTOM_VALUE) {
      void saveInterval(customSec);
    } else {
      void saveInterval(Number(value));
    }
  }

  function onCustomBlur() {
    void saveInterval(customSec);
  }

  async function saveModel() {
    if (model === settings.model) return;
    await window.slowblink.setSettings({ model });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="interval" className="text-sm">
          Interval
        </label>
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={onIntervalSelect}>
            <SelectTrigger id="interval" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_PRESETS_SEC.map((sec) => (
                <SelectItem key={sec} value={String(sec)}>
                  {formatPreset(sec)}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_VALUE}>Custom…</SelectItem>
            </SelectContent>
          </Select>
          {selected === CUSTOM_VALUE && (
            <Input
              id="interval-custom"
              type="number"
              min={1}
              value={customSec}
              onChange={(e) => setCustomSec(Number(e.target.value))}
              onBlur={onCustomBlur}
              className="w-24"
              aria-label="Custom interval in seconds"
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="model" className="text-sm">
          Model
        </label>
        <Input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={saveModel}
          className="w-64"
        />
      </div>
    </div>
  );
}
