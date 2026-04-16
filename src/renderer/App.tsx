import type { CaptureStatus, Settings as SettingsT } from '@shared/types';
import {
  Clock,
  FlaskConical,
  Monitor,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { Dev } from '@/views/Dev';
import { SettingsView } from '@/views/Settings';
import { Timeline } from '@/views/Timeline';

type NavId = 'timeline' | 'dev' | 'settings';

export default function App() {
  const [view, setView] = useState<NavId>('timeline');
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [settings, setSettings] = useState<SettingsT | null>(null);

  useMountEffect(() => {
    let prevError: string | null = null;

    function handleStatus(s: CaptureStatus) {
      setStatus(s);
      if (s.lastError && s.lastError !== prevError) {
        toast.error('Capture error', {
          id: 'capture-error',
          description: s.lastError,
        });
      }
      prevError = s.lastError;
    }

    void window.slowblink.getStatus().then(handleStatus);
    void window.slowblink.getSettings().then(setSettings);
    const unsubStatus = window.slowblink.onStatus(handleStatus);
    const unsubSettings = window.slowblink.onSettings(setSettings);
    return () => {
      unsubStatus();
      unsubSettings();
    };
  });

  return (
    <SidebarProvider>
      <div
        className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-between"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center pl-24"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <SidebarTrigger />
        </div>
        <div
          className="flex items-center pt-2 pr-6 text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <StatusBadge status={status} />
        </div>
      </div>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarContent className="pt-12">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === 'timeline'}
                    tooltip="Timeline"
                    onClick={() => setView('timeline')}
                  >
                    <Clock />
                    <span>Timeline</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {import.meta.env.DEV && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === 'dev'}
                  tooltip="Dev"
                  onClick={() => setView('dev')}
                >
                  <FlaskConical />
                  <span>Dev</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={view === 'settings'}
                tooltip="Settings"
                onClick={() => setView('settings')}
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <ThemeToggle />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <div className="flex max-w-[76vw] flex-1 flex-col pt-12 transition-[max-width] duration-200 ease-linear peer-data-[state=collapsed]:max-w-[calc(76vw+12rem)]">
        <main className="flex max-h-[92vh] flex-1 flex-col rounded-xl bg-background">
          <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-4 pb-6">
            {view === 'timeline' && <Timeline />}
            {view === 'dev' && <Dev />}
            {view === 'settings' && (
              <SettingsView status={status} settings={settings} />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const order = ['light', 'dark', 'system'] as const;
    const next =
      order[
        (order.indexOf(theme as (typeof order)[number]) + 1) % order.length
      ];
    setTheme(next);
  }

  const labels: Record<string, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  };
  const label = labels[theme ?? 'system'] ?? 'System';

  return (
    <SidebarMenuButton tooltip={`${label} Theme`} onClick={cycle}>
      {theme === 'dark' && <Moon />}
      {theme === 'light' && <Sun />}
      {theme !== 'dark' && theme !== 'light' && <Monitor />}
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

function collectIssues(status: CaptureStatus): string[] {
  const issues: string[] = [];
  if (!status.hasPermission) issues.push('no permission');
  if (!status.hasApiKey) issues.push('no API key');
  return issues;
}

function statusColor(status: CaptureStatus, hasIssues: boolean): string {
  if (hasIssues || status.lastError) return 'bg-destructive';
  if (status.paused) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function statusLabel(status: CaptureStatus, issues: string[]): string {
  if (issues.length) return issues.join(' • ');
  if (status.paused) return 'paused';
  if (status.lastCaptureTs) {
    return `Last Updated at ${new Date(status.lastCaptureTs).toLocaleTimeString()}`;
  }
  return 'Running';
}

function StatusBadge({ status }: { status: CaptureStatus | null }) {
  if (!status) return null;
  const issues = collectIssues(status);
  const color = statusColor(status, issues.length > 0);
  const label = statusLabel(status, issues);
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}
