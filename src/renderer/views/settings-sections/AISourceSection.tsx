import type {
  AIMode,
  ApiKeySource,
  AuthSession,
  Plan,
  Settings,
} from '@shared/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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

  async function choose(mode: AIMode) {
    try {
      await window.slowblink.setSettings({ aiMode: mode });
    } catch (err) {
      toast.error('Could not change AI source', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function signIn() {
    try {
      await window.slowblink.signIn();
    } catch (err) {
      toast.error('Sign-in failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function upgrade() {
    try {
      await window.slowblink.openCheckout();
    } catch (err) {
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const hosted = hostedContent({ hostedDisabled, needsUpgrade });

  function onHostedClick() {
    if (hostedDisabled) return signIn();
    if (needsUpgrade) return upgrade();
    return choose('cloud-ai');
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Option
          active={settings.aiMode === 'byo-key'}
          title="Bring your own key"
          description="Uses the API key saved on this Mac."
          onClick={() => choose('byo-key')}
        />
        <Option
          active={settings.aiMode === 'cloud-ai' && !hostedLocked}
          title="Hosted"
          description={hosted.description}
          badge={hosted.badge}
          onClick={onHostedClick}
        />
      </div>
      {settings.aiMode === 'byo-key' && <ApiKey settings={settings} />}
    </div>
  );
}

function hostedContent({
  hostedDisabled,
  needsUpgrade,
}: {
  hostedDisabled: boolean;
  needsUpgrade: boolean;
}): {
  description: string;
  badge: { label: string; variant: BadgeVariant } | null;
} {
  if (hostedDisabled || needsUpgrade) {
    return {
      description: 'Managed model, no setup.',
      badge: {
        label: hostedDisabled ? 'Requires an account' : 'Paid plan',
        variant: 'secondary',
      },
    };
  }
  return {
    description: 'Managed model with DLP filtering.',
    badge: null,
  };
}

function optionClass(active: boolean): string {
  if (active) {
    return 'border-primary bg-primary/5';
  }
  return 'border-input hover:bg-accent hover:text-accent-foreground';
}

function Option({
  active,
  title,
  description,
  badge,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  badge?: { label: string; variant: BadgeVariant } | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-md border p-4 text-left',
        optionClass(active),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{title}</p>
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
      </div>
      <p className="text-xs opacity-80">{description}</p>
    </button>
  );
}

function ApiKey({ settings }: { settings: Settings }) {
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
    <div className="flex items-center gap-3">
      <label htmlFor="llm-api-key" className="shrink-0 font-medium text-sm">
        LLM API key
      </label>
      <KeyBadge source={settings.apiKeySource} hint={settings.apiKeyHint} />
      <Input
        id="llm-api-key"
        type="password"
        placeholder={settings.apiKeyHint ?? 'sk-…'}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="flex-1"
      />
      <Button onClick={saveKey} disabled={!apiKey}>
        Save key
      </Button>
      {settings.apiKeySource === 'saved' && (
        <Button variant="destructive" onClick={clearKey}>
          Clear
        </Button>
      )}
    </div>
  );
}

function KeyBadge({
  source,
  hint,
}: {
  source: ApiKeySource;
  hint: string | null;
}) {
  if (source === 'saved') {
    return <Badge variant="default">Saved ({hint ?? 'encrypted'})</Badge>;
  }
  if (source === null) {
    return <Badge variant="destructive">No key</Badge>;
  }
  return null;
}
