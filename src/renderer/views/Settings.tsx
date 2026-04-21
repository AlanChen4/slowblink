import type {
  AuthSession,
  CaptureStatus,
  Plan,
  Settings as SettingsT,
  SyncStatus,
} from '@shared/types';
import { Camera, Database, Sparkles, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AccountSection } from '@/views/settings-sections/AccountSection';
import { AISourceSection } from '@/views/settings-sections/AISourceSection';
import { PermissionsSection } from '@/views/settings-sections/PermissionsSection';
import { SyncSection } from '@/views/settings-sections/SyncSection';

type Section = 'account' | 'ai' | 'capture' | 'data';

const SECTIONS: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'data', label: 'Data', icon: Database },
];

export function SettingsView({
  status,
  settings,
  session,
  plan,
  sync,
}: {
  status: CaptureStatus | null;
  settings: SettingsT | null;
  session: AuthSession | null;
  plan: Plan;
  sync: SyncStatus | null;
}) {
  const [section, setSection] = useState<Section>('account');

  if (!settings) return null;

  return (
    <div className="flex min-h-full flex-1 gap-6 pt-2">
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r pr-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                section === s.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 space-y-8">
        {section === 'account' && (
          <>
            <AccountSection session={session} plan={plan} />
            <SyncSection
              settings={settings}
              sync={sync}
              session={session}
              plan={plan}
            />
          </>
        )}
        {section === 'ai' && (
          <AISourceSection settings={settings} session={session} plan={plan} />
        )}
        {section === 'capture' && (
          <>
            <CaptureSection settings={settings} />
            <PermissionsSection status={status} />
          </>
        )}
        {section === 'data' && <DataSection session={session} />}
      </div>
    </div>
  );
}

const INTERVAL_PRESETS_SEC = [5, 10, 30, 60, 300, 900] as const;
const CUSTOM_VALUE = 'custom';

function formatPreset(sec: number): string {
  if (sec < 60) return `${sec} seconds`;
  if (sec === 60) return '1 minute';
  return `${sec / 60} minutes`;
}

function CaptureSection({ settings }: { settings: SettingsT }) {
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

function DataSection({ session }: { session: AuthSession | null }) {
  async function deleteAll() {
    const msg = session
      ? 'Delete all recorded samples, both on this Mac AND in your account? This cannot be undone.'
      : 'Delete all recorded samples on this Mac? This cannot be undone.';
    if (!confirm(msg)) return;
    await window.slowblink.deleteAllData();
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm">
        Permanently delete all recorded samples
        {session ? ' (local + cloud)' : ''}.
      </p>
      <Button variant="destructive" onClick={deleteAll}>
        Delete all data
      </Button>
    </div>
  );
}
