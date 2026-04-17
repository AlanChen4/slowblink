import type { AIMode, AuthSession, Plan, Settings } from '@shared/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function AISourceSection({
  settings,
  session,
  plan,
}: {
  settings: Settings;
  session: AuthSession | null;
  plan: Plan;
}) {
  function cloudAiBlockedReason(): string | null {
    if (!session) return 'Sign in to use hosted AI';
    if (plan.tier !== 'paid') return 'Hosted AI requires a paid plan';
    return null;
  }

  async function choose(mode: AIMode) {
    if (mode === 'cloud-ai') {
      const reason = cloudAiBlockedReason();
      if (reason) {
        toast.error(reason);
        return;
      }
    }
    try {
      await window.slowblink.setSettings({ aiMode: mode });
    } catch (err) {
      toast.error('Could not change AI source', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm">AI source</h3>
      <div className="grid grid-cols-2 gap-3">
        <Option
          active={settings.aiMode === 'byo-key'}
          title="Your OpenAI key"
          description="Uses the key saved on this Mac."
          onClick={() => choose('byo-key')}
        />
        <Option
          active={settings.aiMode === 'cloud-ai'}
          title="slowblink hosted AI"
          description={
            plan.tier === 'paid'
              ? 'Managed model with DLP filtering.'
              : 'Requires paid plan.'
          }
          onClick={() => choose('cloud-ai')}
        />
      </div>
    </div>
  );
}

function Option({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className="h-auto justify-start whitespace-normal p-4 text-left"
    >
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </Button>
  );
}
