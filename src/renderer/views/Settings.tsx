import type {
  AuthSession,
  CaptureStatus,
  Plan,
  Settings as SettingsT,
  SyncStatus,
} from '@shared/types';
import { Camera, Database, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountSection } from '@/views/settings-sections/AccountSection';
import { AISourceSection } from '@/views/settings-sections/AISourceSection';
import { CaptureSection } from '@/views/settings-sections/CaptureSection';
import { DataSection } from '@/views/settings-sections/DataSection';
import { PermissionsSection } from '@/views/settings-sections/PermissionsSection';
import { SyncSection } from '@/views/settings-sections/SyncSection';

export type SettingsSection = 'account' | 'capture' | 'data';

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'data', label: 'Data', icon: Database },
];

export function SettingsView({
  status,
  settings,
  session,
  plan,
  sync,
  section,
  onSectionChange,
}: {
  status: CaptureStatus | null;
  settings: SettingsT | null;
  session: AuthSession | null;
  plan: Plan;
  sync: SyncStatus | null;
  section: SettingsSection;
  onSectionChange: (s: SettingsSection) => void;
}) {
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
              onClick={() => onSectionChange(s.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                section === s.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
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
            <SyncSection settings={settings} session={session} />
          </>
        )}
        {section === 'capture' && (
          <>
            <AISourceSection
              settings={settings}
              session={session}
              plan={plan}
            />
            <CaptureSection settings={settings} />
            <PermissionsSection status={status} />
          </>
        )}
        {section === 'data' && (
          <DataSection
            session={session}
            settings={settings}
            sync={sync}
            plan={plan}
          />
        )}
      </div>
    </div>
  );
}
