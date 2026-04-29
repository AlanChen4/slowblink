import type {
  Category,
  DaySummary,
  MonthSummary,
  Session,
  WeekSummary,
} from '@shared/types';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { CATEGORY_COLORS } from '@/lib/categories';

type Tab = 'day' | 'week' | 'month';

export function Insights() {
  const [tab, setTab] = useState<Tab>('day');
  const [date, setDate] = useState(() => todayStr());
  const [week, setWeek] = useState(() => currentWeekStr());
  const [month, setMonth] = useState(() => currentMonthStr());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Insights</h2>
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month'] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {tab === 'day' && <DayView date={date} onDateChange={setDate} />}
        {tab === 'week' && <WeekView week={week} onWeekChange={setWeek} />}
        {tab === 'month' && (
          <MonthView month={month} onMonthChange={setMonth} />
        )}
      </div>
    </div>
  );
}

function DayView({
  date,
  onDateChange,
}: {
  date: string;
  onDateChange: (d: string) => void;
}) {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useMountEffect(() => {
    loadDay(date, setSummary, setLoading);
  });

  const handleDateChange = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    onDateChange(next);
    loadDay(next, setSummary, setLoading);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await window.slowblink.refreshInsights(`day:${date}`);
      if (result) setSummary(result);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <InsightsLoading />;
  if (!summary || summary.sessions.length === 0) {
    return <EmptyState label={`No data for ${formatDate(date)}`} />;
  }

  const totalMinutes = Math.round(
    summary.sessions.reduce((a, s) => a + s.durationMs, 0) / 60000,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDateChange(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-medium text-sm">{formatDate(date)}</span>
          <Button variant="ghost" size="sm" onClick={() => handleDateChange(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>{totalMinutes} min tracked</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {summary.highlights.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Highlights</h3>
          <ul className="space-y-1 text-sm">
            {summary.highlights.map((h) => (
              <li key={h} className="text-muted-foreground">
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.topProjects.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Top Projects</h3>
          <div className="space-y-2">
            {summary.topProjects.map((p) => (
              <div
                key={p.project}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-sm">{p.project}</span>
                  <p className="text-muted-foreground text-xs">
                    {p.description}
                  </p>
                </div>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {p.durationMinutes}m
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary.patterns.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Patterns</h3>
          <ul className="space-y-1 text-sm">
            {summary.patterns.map((p) => (
              <li key={p} className="text-muted-foreground">
                {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.categoryBreakdown.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Category Breakdown</h3>
          <CategoryBar breakdown={summary.categoryBreakdown} />
        </Card>
      )}

      <div>
        <h3 className="mb-2 font-medium text-sm">Sessions</h3>
        <div className="space-y-2">
          {summary.sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekView({
  week,
  onWeekChange,
}: {
  week: string;
  onWeekChange: (w: string) => void;
}) {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useMountEffect(() => {
    loadWeek(week, setSummary, setLoading);
  });

  const handleWeekChange = (delta: number) => {
    const next = shiftWeek(week, delta);
    onWeekChange(next);
    loadWeek(next, setSummary, setLoading);
  };

  if (loading) return <InsightsLoading />;
  if (!summary || summary.highlights.length === 0) {
    return <EmptyState label={`No data for ${week}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => handleWeekChange(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="font-medium text-sm">{week}</span>
        <Button variant="ghost" size="sm" onClick={() => handleWeekChange(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {summary.highlights.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Weekly Highlights</h3>
          <ul className="space-y-1 text-sm">
            {summary.highlights.map((h) => (
              <li key={h} className="text-muted-foreground">
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.topProjects.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Top Projects</h3>
          <div className="space-y-2">
            {summary.topProjects.map((p) => (
              <div
                key={p.project}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-sm">{p.project}</span>
                  <p className="text-muted-foreground text-xs">
                    {p.description}
                  </p>
                </div>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {p.durationMinutes}m
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary.trends.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Trends</h3>
          <ul className="space-y-1 text-sm">
            {summary.trends.map((t) => (
              <li key={t} className="text-muted-foreground">
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.dailyBreakdown.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Daily Breakdown</h3>
          <div className="space-y-3">
            {summary.dailyBreakdown.map((d) => (
              <div key={d.date}>
                <span className="font-medium text-xs">
                  {formatDate(d.date)}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {d.highlights.map((h) => (
                    <li key={h} className="text-muted-foreground text-xs">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function MonthView({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useMountEffect(() => {
    loadMonth(month, setSummary, setLoading);
  });

  const handleMonthChange = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(next);
    loadMonth(next, setSummary, setLoading);
  };

  if (loading) return <InsightsLoading />;
  if (!summary || summary.highlights.length === 0) {
    return <EmptyState label={`No data for ${formatMonth(month)}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => handleMonthChange(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="font-medium text-sm">{formatMonth(month)}</span>
        <Button variant="ghost" size="sm" onClick={() => handleMonthChange(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {summary.highlights.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Monthly Highlights</h3>
          <ul className="space-y-1 text-sm">
            {summary.highlights.map((h) => (
              <li key={h} className="text-muted-foreground">
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.topProjects.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Top Projects</h3>
          <div className="space-y-2">
            {summary.topProjects.map((p) => (
              <div
                key={p.project}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-sm">{p.project}</span>
                  <p className="text-muted-foreground text-xs">
                    {p.description}
                  </p>
                </div>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {p.durationMinutes}m
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary.trends.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Trends</h3>
          <ul className="space-y-1 text-sm">
            {summary.trends.map((t) => (
              <li key={t} className="text-muted-foreground">
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.weeklyBreakdown.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-medium text-sm">Weekly Breakdown</h3>
          <div className="space-y-3">
            {summary.weeklyBreakdown.map((w) => (
              <div key={w.week}>
                <span className="font-medium text-xs">{w.week}</span>
                <ul className="mt-1 space-y-0.5">
                  {w.highlights.map((h) => (
                    <li key={h} className="text-muted-foreground text-xs">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const start = new Date(session.startTs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const end = new Date(session.endTs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dur = Math.round(session.durationMs / 60000);
  const color =
    CATEGORY_COLORS[session.primaryCategory as Category] ?? 'bg-zinc-500';

  return (
    <Card className="flex items-start gap-3 p-3">
      <span className={`mt-1 size-3 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            {start} - {end}
          </span>
          <span className="tabular-nums">{dur}m</span>
        </div>
        <p className="mt-0.5 text-sm">
          {session.summary ??
            `${session.primaryCategory} in ${session.primaryApp ?? 'unknown'}`}
        </p>
        {session.primaryProject && (
          <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
            {session.primaryProject}
          </span>
        )}
      </div>
    </Card>
  );
}

function CategoryBar({
  breakdown,
}: {
  breakdown: { category: string; minutes: number }[];
}) {
  const total = breakdown.reduce((a, b) => a + b.minutes, 0);
  if (total === 0) return null;

  const sorted = [...breakdown].sort((a, b) => b.minutes - a.minutes);

  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded">
        {sorted.map(({ category, minutes }) => {
          const pct = (minutes / total) * 100;
          const color = CATEGORY_COLORS[category as Category] ?? 'bg-zinc-500';
          return (
            <div
              key={category}
              className={color}
              style={{ width: `${pct}%` }}
              title={`${category}: ${minutes}m`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {sorted.map(({ category, minutes }) => (
          <div key={category} className="flex items-center gap-1">
            <span
              className={`inline-block size-2 rounded-full ${CATEGORY_COLORS[category as Category] ?? 'bg-zinc-500'}`}
            />
            <span className="text-muted-foreground">
              {category} ({minutes}m)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-muted-foreground text-sm">{label}</p>;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentWeekStr(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + ((jan1.getDay() + 6) % 7)) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function shiftWeek(week: string, delta: number): string {
  const [yearStr, weekStr] = week.split('-W');
  const year = Number(yearStr);
  const weekNum = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + (weekNum - 1) * 7);
  monday.setDate(monday.getDate() + delta * 7);

  const newJan1 = new Date(monday.getFullYear(), 0, 1);
  const newDayOfYear =
    Math.floor((monday.getTime() - newJan1.getTime()) / 86400000) + 1;
  const newWeekNum = Math.ceil(
    (newDayOfYear + ((newJan1.getDay() + 6) % 7)) / 7,
  );
  return `${monday.getFullYear()}-W${String(newWeekNum).padStart(2, '0')}`;
}

function loadDay(
  date: string,
  setSummary: (s: DaySummary | null) => void,
  setLoading: (l: boolean) => void,
) {
  setLoading(true);
  window.slowblink
    .getDaySummary(date)
    .then(setSummary)
    .catch(() => setSummary(null))
    .finally(() => setLoading(false));
}

function loadWeek(
  week: string,
  setSummary: (s: WeekSummary | null) => void,
  setLoading: (l: boolean) => void,
) {
  setLoading(true);
  window.slowblink
    .getWeekSummary(week)
    .then(setSummary)
    .catch(() => setSummary(null))
    .finally(() => setLoading(false));
}

function loadMonth(
  month: string,
  setSummary: (s: MonthSummary | null) => void,
  setLoading: (l: boolean) => void,
) {
  setLoading(true);
  window.slowblink
    .getMonthSummary(month)
    .then(setSummary)
    .catch(() => setSummary(null))
    .finally(() => setLoading(false));
}
