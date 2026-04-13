import type {
  ApiKeySource,
  CaptureStatus,
  Settings as SettingsT,
} from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export function SettingsView({
  status,
  settings,
}: {
  status: CaptureStatus | null;
  settings: SettingsT | null;
}) {
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <CaptureSection
        key={`${settings.intervalMs}|${settings.model}`}
        settings={settings}
      />
      <Separator />
      <ApiKeySection settings={settings} />
      <Separator />
      <PermissionsSection status={status} />
      <Separator />
      <DataSection />
    </div>
  );
}

function CaptureSection({ settings }: { settings: SettingsT }) {
  const [intervalSec, setIntervalSec] = useState(
    Math.round(settings.intervalMs / 1000),
  );
  const [model, setModel] = useState(settings.model);

  async function save() {
    await window.slowblink.setSettings({
      intervalMs: intervalSec * 1000,
      model,
    });
  }

  async function togglePaused() {
    if (settings.paused) await window.slowblink.resume();
    else await window.slowblink.pause();
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Capture</h3>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="interval-sec" className="text-sm">
          Interval (seconds)
        </label>
        <Input
          id="interval-sec"
          type="number"
          min={1}
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
          className="w-32"
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="model" className="text-sm">
          Model
        </label>
        <Input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-64"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={save}>Save</Button>
        <Button variant="outline" onClick={togglePaused}>
          {settings.paused ? 'Resume' : 'Pause'}
        </Button>
        {import.meta.env.DEV && <DevCaptureButton />}
      </div>
    </div>
  );
}

function DevCaptureButton() {
  async function trigger() {
    try {
      if (typeof window.slowblink.captureOnce !== 'function') {
        toast.error('captureOnce not available', {
          description:
            'captureOnce is not exposed on the preload API — restart `pnpm dev` so the preload bundle reloads.',
        });
        return;
      }
      await window.slowblink.captureOnce();
      toast.success('Capture complete');
    } catch (err) {
      toast.error('Capture failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <Button variant="secondary" onClick={trigger}>
      Capture once (dev)
    </Button>
  );
}

function ApiKeyStatus({
  source,
  hint,
}: {
  source: ApiKeySource;
  hint: string | null;
}) {
  if (source === 'saved')
    return `Saved to macOS Keychain (${hint ?? 'encrypted'}).`;
  if (source === 'env')
    return 'Detected from OPENAI_API_KEY environment variable. Save a key below to override it.';
  return 'No key set. slowblink cannot summarize screenshots until you provide one.';
}

function ApiKeySection({ settings }: { settings: SettingsT }) {
  const [apiKey, setApiKey] = useState('');

  async function saveKey() {
    if (!apiKey) return;
    await window.slowblink.setApiKey(apiKey);
    setApiKey('');
  }

  async function clearKey() {
    await window.slowblink.clearApiKey();
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">OpenAI API key</h3>
      <p className="text-muted-foreground text-xs">
        <ApiKeyStatus
          source={settings.apiKeySource}
          hint={settings.apiKeyHint}
        />
      </p>
      <div className="flex items-center justify-end gap-2">
        {settings.apiKeySource === 'env' ? (
          <Input readOnly value={settings.apiKeyHint ?? ''} className="w-64" />
        ) : (
          <Input
            type="password"
            placeholder={settings.apiKeyHint ?? 'sk-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-64"
          />
        )}
        <Button onClick={saveKey} disabled={!apiKey}>
          Save key
        </Button>
        {settings.apiKeySource === 'saved' && (
          <Button variant="destructive" onClick={clearKey}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function PermissionsSection({ status }: { status: CaptureStatus | null }) {
  async function requestScreen() {
    const granted = await window.slowblink.requestPermission();
    if (!granted) {
      toast.error('Screen recording not granted', {
        description:
          'System Settings has been opened — enable slowblink (or Electron in dev) under Privacy & Security → Screen Recording, then quit and relaunch the app.',
      });
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Permissions</h3>
      <PermissionRow
        label="Screen recording"
        granted={status?.hasPermission}
        requestLabel="Request screen recording"
        onRequest={requestScreen}
        onOpenSettings={() => window.slowblink.openPermissionSettings()}
      />
      <PermissionRow
        label="Accessibility"
        granted={status?.hasAccessibility}
        hint="Enables reading the focused window title and open windows across apps for richer context."
        requestLabel="Request accessibility"
        onRequest={() => window.slowblink.requestAccessibilityPermission()}
        onOpenSettings={() =>
          window.slowblink.openAccessibilityPermissionSettings()
        }
      />
    </div>
  );
}

function PermissionRow({
  label,
  granted,
  hint,
  requestLabel,
  onRequest,
  onOpenSettings,
}: {
  label: string;
  granted: boolean | undefined;
  hint?: string;
  requestLabel: string;
  onRequest: () => unknown;
  onOpenSettings: () => unknown;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          {label}:{' '}
          <span className={granted ? 'text-green-600' : 'text-red-600'}>
            {granted ? 'granted' : 'not granted'}
          </span>
        </p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" disabled={granted} onClick={onRequest}>
          {granted ? 'Already granted' : requestLabel}
        </Button>
        <Button variant="outline" onClick={onOpenSettings}>
          Open Settings
        </Button>
      </div>
    </div>
  );
}

function DataSection() {
  async function deleteAll() {
    if (!confirm('Delete all recorded samples?')) return;
    await window.slowblink.deleteAllData();
  }
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Data</h3>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">Permanently delete all recorded samples.</p>
        <Button variant="destructive" onClick={deleteAll}>
          Delete all data
        </Button>
      </div>
    </div>
  );
}
