import type { AuthSession, Plan } from '@shared/types';
import { toast } from 'sonner';
import { GoogleIcon } from '@/components/icons/google';
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
      {session ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">
            Signed in as{' '}
            <span className="font-medium">{session.user.email}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            {plan.tier === 'paid' ? (
              <Button variant="secondary" onClick={portal}>
                Manage subscription
              </Button>
            ) : (
              <Button variant="secondary" onClick={checkout}>
                Upgrade
              </Button>
            )}
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Create an account for sync and more cool features
          </p>
          <Button variant="outline" onClick={signIn} className="gap-2">
            <GoogleIcon className="size-4" />
            Continue with Google
          </Button>
        </div>
      )}
    </div>
  );
}
