import type {
  ApiKeySource,
  AuthSession,
  CaptureStatus,
  Plan,
  Settings as SettingsT,
  SyncStatus,
} from '@shared/types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AccountSection } from '@/views/settings-sections/AccountSection';
import { AISourceSection } from '@/views/settings-sections/AISourceSection';
import { PermissionsSection } from '@/views/settings-sections/PermissionsSection';
import { SyncSection } from '@/views/settings-sections/SyncSection';

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
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <AccountSection session={session} plan={plan} />
      <Separator />
      <SyncSection
        settings={settings}
        sync={sync}
        session={session}
        plan={plan}
      />
      <Separator />
      <AISourceSection settings={settings} session={session} plan={plan} />
      {settings.aiMode === 'byo-key' && (
        <>
          <Separator />
          <ApiKeySection settings={settings} />
        </>
      )}
      <Separator />
      <CaptureSection
        key={`${settings.intervalMs}|${settings.model}`}
        settings={settings}
      />
      <Separator />
      <PermissionsSection status={status} />
      <Separator />
      <DataSection session={session} />
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
      </div>
    </div>
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

function DataSection({ session }: { session: AuthSession | null }) {
  async function deleteAll() {
    const msg = session
      ? 'Delete all recorded samples, both on this Mac AND in your account? This cannot be undone.'
      : 'Delete all recorded samples on this Mac? This cannot be undone.';
    if (!confirm(msg)) return;
    await window.slowblink.deleteAllData();
  }
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Data</h3>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">
          Permanently delete all recorded samples
          {session ? ' (local + cloud)' : ''}.
        </p>
        <Button variant="destructive" onClick={deleteAll}>
          Delete all data
        </Button>
      </div>
    </div>
  );
}
