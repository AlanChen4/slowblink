import type { AuthSession, Plan } from '@shared/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function AccountSection({
  session,
  plan,
}: {
  session: AuthSession | null;
  plan: Plan;
}) {
  async function signIn() {
    try {
      await window.slowblink.signIn();
    } catch (err) {
      toast.error('Sign-in failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
  async function signOut() {
    await window.slowblink.signOut();
  }
  async function portal() {
    try {
      await window.slowblink.openPortal();
    } catch (err) {
      toast.error('Could not open billing portal', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
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
    <div className="space-y-4">
      <h3 className="font-medium text-sm">Account</h3>
      {session ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm">
              Signed in as{' '}
              <span className="font-medium">{session.user.email}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              Plan: {plan.tier === 'paid' ? 'Paid' : 'Free'}
              {plan.renewsAt
                ? ` · renews ${new Date(plan.renewsAt).toLocaleDateString()}`
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {plan.tier === 'paid' ? (
              <Button variant="outline" onClick={portal}>
                Manage subscription
              </Button>
            ) : (
              <Button variant="outline" onClick={checkout}>
                Upgrade
              </Button>
            )}
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Sign in to enable cloud sync, hosted AI, or a paid plan. Local-only
            usage never requires an account.
          </p>
          <Button variant="outline" onClick={signIn}>
            Continue with Google
          </Button>
        </div>
      )}
    </div>
  );
}
