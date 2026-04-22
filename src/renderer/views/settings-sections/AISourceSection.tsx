import type { AIMode, AuthSession, Plan, Settings } from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

function isAIMode(value: string): value is AIMode {
  return value === 'byo-key' || value === 'cloud-ai';
}

function hostedHintFor(
  hostedDisabled: boolean,
  needsUpgrade: boolean,
): string | null {
  if (hostedDisabled) return 'Requires an account';
  if (needsUpgrade) return 'Paid plan';
  return null;
}

export function AISourceSection({
  settings,
  session,
  plan,
}: {
  settings: Settings;
  session: AuthSession | null;
  plan: Plan;
}) {
  const hostedDisabled = !session;
  const needsUpgrade = !!session && plan.tier !== 'paid';
  const hostedLocked = hostedDisabled || needsUpgrade;

  async function onValueChange(value: string) {
    if (!isAIMode(value)) return;
    if (value === 'cloud-ai' && hostedLocked) return;
    try {
      await window.slowblink.setSettings({ aiMode: value });
    } catch (err) {
      toast.error('Could not change AI source', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const activeValue =
    settings.aiMode === 'cloud-ai' && !hostedLocked ? 'cloud-ai' : 'byo-key';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="ai-byo" className="text-sm">
          AI source
        </label>
        <RadioGroup
          value={activeValue}
          onValueChange={onValueChange}
          className="flex items-center gap-4"
        >
          <RadioOption id="ai-byo" value="byo-key" label="Bring your own key" />
          <RadioOption
            id="ai-hosted"
            value="cloud-ai"
            label="Hosted"
            disabled={hostedLocked}
            hint={hostedHintFor(hostedDisabled, needsUpgrade)}
          />
        </RadioGroup>
      </div>
      {activeValue === 'byo-key' && (
        <ApiKey key={settings.apiKeyHint ?? 'none'} settings={settings} />
      )}
    </div>
  );
}

function RadioOption({
  id,
  value,
  label,
  disabled,
  hint,
}: {
  id: string;
  value: AIMode;
  label: string;
  disabled?: boolean;
  hint?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={value} disabled={disabled} />
      <label
        htmlFor={id}
        className={
          disabled
            ? 'cursor-not-allowed text-muted-foreground text-sm'
            : 'cursor-pointer text-sm'
        }
      >
        {label}
      </label>
      {hint && <Badge variant="secondary">{hint}</Badge>}
    </div>
  );
}

function ApiKey({ settings }: { settings: Settings }) {
  const [apiKey, setApiKey] = useState(settings.apiKey ?? '');

  async function saveKey() {
    if (!apiKey || apiKey === settings.apiKey) return;
    await window.slowblink.setApiKey(apiKey);
  }

  async function clearKey() {
    await window.slowblink.clearApiKey();
  }

  const unchanged = apiKey === (settings.apiKey ?? '');
  const missing = settings.apiKeySource === null;

  return (
    <div className="flex items-center justify-between gap-4">
      <label
        htmlFor="llm-api-key"
        className={cn('text-sm', missing && 'text-red-600 dark:text-red-400')}
      >
        LLM API key
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="llm-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          error={missing}
          className="w-64"
        />
        <Button
          variant="outline"
          onClick={saveKey}
          disabled={!apiKey || unchanged}
        >
          Save
        </Button>
        {settings.apiKeySource === 'saved' && (
          <Button variant="destructiveSecondary" onClick={clearKey}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
