import type {
  AIMode,
  AuthSession,
  CaptureStatus,
  Plan,
  Settings,
  StorageMode,
} from '@shared/types';
import { Check, Cloud, HardDrive, KeyRound, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { GoogleIcon } from '@/components/icons/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PermissionRow } from '@/views/settings-sections/PermissionsSection';

type Step =
  | 'welcome'
  | 'storage'
  | 'ai'
  | 'sign-in'
  | 'upgrade'
  | 'api-key'
  | 'permissions'
  | 'done';

interface OnboardingProps {
  settings: Settings;
  status: CaptureStatus | null;
  session: AuthSession | null;
  plan: Plan;
}

interface Choices {
  storageMode: StorageMode;
  aiMode: AIMode;
}

function needsAuth(c: Choices): boolean {
  return c.storageMode === 'cloud-sync' || c.aiMode === 'cloud-ai';
}

function needsPaid(c: Choices): boolean {
  return c.aiMode === 'cloud-ai';
}

export function Onboarding({
  settings,
  status,
  session,
  plan,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [choices, setChoices] = useState<Choices>({
    storageMode: settings.storageMode,
    aiMode: settings.aiMode,
  });

  async function finish() {
    await window.slowblink.setSettings({
      storageMode: choices.storageMode,
      aiMode: choices.aiMode,
      onboardingComplete: true,
    });
  }

  const context: StepContext = { choices, session, plan, settings };
  function advanceFrom(current: Step) {
    const next = nextStep(current, context);
    if (next === 'done') {
      void finish();
      return;
    }
    setStep(next);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-12">
      <StepPanel
        key={step}
        step={step}
        choices={choices}
        setChoices={setChoices}
        settings={settings}
        status={status}
        session={session}
        plan={plan}
        onAdvance={() => advanceFrom(step)}
        onBack={() => setStep(previousStep(step, context))}
      />
    </div>
  );
}

const STEP_ORDER: Step[] = [
  'welcome',
  'storage',
  'ai',
  'sign-in',
  'upgrade',
  'api-key',
  'permissions',
  'done',
];

interface StepContext {
  choices: Choices;
  session: AuthSession | null;
  plan: Plan;
  settings: Settings;
}

function shouldSkipStep(step: Step, ctx: StepContext): boolean {
  if (step === 'sign-in') return !needsAuth(ctx.choices) || !!ctx.session;
  if (step === 'upgrade')
    return !needsPaid(ctx.choices) || ctx.plan.tier === 'paid';
  if (step === 'api-key')
    return ctx.choices.aiMode === 'cloud-ai' || ctx.settings.hasApiKey;
  return false;
}

function nextStep(current: Step, ctx: StepContext): Step {
  for (
    let idx = STEP_ORDER.indexOf(current) + 1;
    idx < STEP_ORDER.length;
    idx += 1
  ) {
    const candidate = STEP_ORDER[idx];
    if (!shouldSkipStep(candidate, ctx)) return candidate;
  }
  return 'done';
}

function previousStep(current: Step, ctx: StepContext): Step {
  const idx = STEP_ORDER.indexOf(current);
  if (idx <= 0) return 'welcome';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const candidate = STEP_ORDER[i];
    if (candidate === 'done') continue;
    if (!shouldSkipStep(candidate, ctx)) return candidate;
  }
  return 'welcome';
}

interface StepPanelProps extends OnboardingProps {
  step: Step;
  choices: Choices;
  setChoices: (c: Choices) => void;
  onAdvance: () => void;
  onBack: () => void;
}

function StepPanel(props: StepPanelProps) {
  const { step } = props;
  if (step === 'welcome') return <WelcomeStep {...props} />;
  if (step === 'storage') return <StorageStep {...props} />;
  if (step === 'ai') return <AIStep {...props} />;
  if (step === 'sign-in') return <SignInStep {...props} />;
  if (step === 'upgrade') return <UpgradeStep {...props} />;
  if (step === 'api-key') return <ApiKeyStep {...props} />;
  if (step === 'permissions') return <PermissionsStep {...props} />;
  return null;
}

function StepShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-2xl">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        )}
      </div>
      {children}
      {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
    </div>
  );
}

function WelcomeStep({ onAdvance }: StepPanelProps) {
  return (
    <StepShell
      title="Welcome to slowblink"
      subtitle="slowblink quietly captures what you work on and uses an AI model to summarize your day. Everything is opt-in."
      footer={<Button onClick={onAdvance}>Get started</Button>}
    >
      <ul className="space-y-2 text-muted-foreground text-sm">
        <li>• Keep everything on your Mac, or sync it to your account.</li>
        <li>• Bring your own AI key, or use our hosted model.</li>
        <li>• You can change these choices any time in Settings.</li>
      </ul>
    </StepShell>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const className = `w-full rounded-lg border p-4 text-left transition-colors ${
    active
      ? 'border-primary bg-primary/5'
      : 'border-input hover:border-foreground/30'
  }`;
  return (
    <button type="button" className={className} onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="flex-1 space-y-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {active && <Check className="text-primary" size={18} />}
      </div>
    </button>
  );
}

function StorageStep({
  choices,
  setChoices,
  onAdvance,
  onBack,
}: StepPanelProps) {
  return (
    <StepShell
      title="Where should your data live?"
      subtitle="Your captures stay on your Mac regardless. Cloud sync pushes a copy to your account so you can see it on other devices."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onAdvance}>Continue</Button>
        </>
      }
    >
      <div className="space-y-3">
        <ChoiceCard
          active={choices.storageMode === 'local'}
          icon={<HardDrive size={18} />}
          title="Local only"
          description="Everything stays on this Mac. No account required."
          onClick={() => setChoices({ ...choices, storageMode: 'local' })}
        />
        <ChoiceCard
          active={choices.storageMode === 'cloud-sync'}
          icon={<Cloud size={18} />}
          title="Local + cloud sync"
          description="Back up captures to your account. Free plan keeps 7 days; paid keeps everything."
          onClick={() => setChoices({ ...choices, storageMode: 'cloud-sync' })}
        />
      </div>
    </StepShell>
  );
}

function AIStep({ choices, setChoices, onAdvance, onBack }: StepPanelProps) {
  return (
    <StepShell
      title="Which AI should power summaries?"
      subtitle="slowblink needs a model to describe what's on your screen."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onAdvance}>Continue</Button>
        </>
      }
    >
      <div className="space-y-3">
        <ChoiceCard
          active={choices.aiMode === 'byo-key'}
          icon={<KeyRound size={18} />}
          title="Use my own OpenAI key"
          description="You provide an OpenAI API key. No account required."
          onClick={() => setChoices({ ...choices, aiMode: 'byo-key' })}
        />
        <ChoiceCard
          active={choices.aiMode === 'cloud-ai'}
          icon={<Sparkles size={18} />}
          title="Use slowblink's hosted AI"
          description="We handle the model, automatically filter sensitive content, and cache results. Requires a paid plan."
          onClick={() => setChoices({ ...choices, aiMode: 'cloud-ai' })}
        />
      </div>
    </StepShell>
  );
}

function SignInStep({ session, onAdvance, onBack }: StepPanelProps) {
  const [launched, setLaunched] = useState(false);
  async function signIn() {
    try {
      await window.slowblink.signIn();
      setLaunched(true);
    } catch (err) {
      toast.error('Sign-in failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <StepShell
      title="Sign in with Google"
      subtitle="Cloud sync and hosted AI are tied to your account."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onAdvance} disabled={!session}>
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Button variant="outline" onClick={signIn} className="w-full">
          <GoogleIcon className="size-4" />
          Continue with Google
        </Button>
        {launched && !session && (
          <p className="text-muted-foreground text-xs">
            Waiting for Google sign-in… your browser should have opened.
          </p>
        )}
        {session && (
          <p className="text-xs">
            Signed in as{' '}
            <span className="font-medium">{session.user.email}</span>.
          </p>
        )}
      </div>
    </StepShell>
  );
}

function UpgradeStep({ plan, onAdvance, onBack }: StepPanelProps) {
  async function checkout() {
    try {
      await window.slowblink.openCheckout();
    } catch (err) {
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <StepShell
      title="Start your 14-day free trial"
      subtitle="$8/month after the trial. Includes hosted AI and unlimited cloud retention."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onAdvance} disabled={plan.tier !== 'paid'}>
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Button onClick={checkout} className="w-full">
          Start trial in browser
        </Button>
        {plan.tier === 'paid' ? (
          <p className="text-xs">Your plan is active. You can continue.</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Complete checkout in your browser, then come back here.
          </p>
        )}
      </div>
    </StepShell>
  );
}

function ApiKeyStep({ onAdvance, onBack, settings }: StepPanelProps) {
  const [value, setValue] = useState('');
  async function save() {
    if (!value) return;
    try {
      await window.slowblink.setApiKey(value);
      setValue('');
      onAdvance();
    } catch (err) {
      toast.error('Could not save key', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    <StepShell
      title="Add your OpenAI API key"
      subtitle="Stored encrypted in macOS Keychain. Only used by this Mac."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={save} disabled={!value}>
            Save key
          </Button>
        </>
      }
    >
      <Input
        type="password"
        placeholder={settings.apiKeyHint ?? 'sk-…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </StepShell>
  );
}

function PermissionsStep({ status, onAdvance, onBack }: StepPanelProps) {
  return (
    <StepShell
      title="Grant system permissions"
      subtitle="slowblink needs screen recording to capture your screen, and accessibility to read window titles."
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onAdvance}>Finish setup</Button>
        </>
      }
    >
      <div className="space-y-4">
        <PermissionRow
          label="Screen recording"
          granted={status?.hasPermission}
          requestLabel="Request"
          onRequest={() => window.slowblink.requestPermission()}
          onOpenSettings={() => window.slowblink.openPermissionSettings()}
        />
        <PermissionRow
          label="Accessibility"
          granted={status?.hasAccessibility}
          hint="Lets slowblink read the focused window title for better summaries."
          requestLabel="Request"
          onRequest={() => window.slowblink.requestAccessibilityPermission()}
          onOpenSettings={() =>
            window.slowblink.openAccessibilityPermissionSettings()
          }
        />
      </div>
    </StepShell>
  );
}
