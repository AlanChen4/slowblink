import type { DaySummary, MonthSummary, WeekSummary } from '../../shared/types';
import {
  generateDaySummary,
  generateMonthSummary,
  generateWeekSummary,
} from '../ai/insights-summarizer';
import { getDb, getSessions } from '../db';
import { getApiKey, getSettings } from '../settings';

function readSummary(key: string): { json: string; stale: boolean } | null {
  const row = getDb()
    .prepare('SELECT summary_json, stale FROM summaries WHERE key = ?')
    .get(key) as { summary_json: string; stale: number } | undefined;
  if (!row) return null;
  return { json: row.summary_json, stale: row.stale === 1 };
}

function writeSummary(key: string, level: string, json: string): void {
  getDb()
    .prepare(
      'INSERT OR REPLACE INTO summaries (key, level, summary_json, generated_ts, stale) VALUES (?, ?, ?, ?, 0)',
    )
    .run(key, level, json, Date.now());
}

export function markStaleDaySummary(date: string): void {
  getDb()
    .prepare('UPDATE summaries SET stale = 1 WHERE key = ?')
    .run(`day:${date}`);
  const weekKey = dateToWeekKey(date);
  getDb()
    .prepare('UPDATE summaries SET stale = 1 WHERE key = ?')
    .run(`week:${weekKey}`);
  const monthKey = date.slice(0, 7);
  getDb()
    .prepare('UPDATE summaries SET stale = 1 WHERE key = ?')
    .run(`month:${monthKey}`);
}

function dateToWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + ((jan1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function dayRange(date: string): { start: number; end: number } {
  const start = new Date(`${date}T00:00:00`).getTime();
  const end = start + 86400000;
  return { start, end };
}

export async function getDaySummary(date: string): Promise<DaySummary> {
  const { start, end } = dayRange(date);
  const sessions = getSessions(start, end);

  const cached = readSummary(`day:${date}`);
  if (cached && !cached.stale) {
    return { date, ...JSON.parse(cached.json), sessions };
  }

  const apiKey = getApiKey();
  if (!apiKey || sessions.length === 0) {
    return {
      date,
      highlights: [],
      topProjects: [],
      patterns: [],
      categoryBreakdown: [],
      sessions,
    };
  }

  const { model } = getSettings();
  const result = await generateDaySummary(date, sessions, apiKey, model);
  writeSummary(`day:${date}`, 'day', JSON.stringify(result));
  return { date, ...result, sessions };
}

export async function getWeekSummary(week: string): Promise<WeekSummary> {
  const cached = readSummary(`week:${week}`);
  if (cached && !cached.stale) {
    return { week, ...JSON.parse(cached.json) };
  }

  const dates = weekToDates(week);
  const daySummaries: { date: string; json: Omit<DaySummary, 'sessions'> }[] =
    [];
  for (const date of dates) {
    const ds = await getDaySummary(date);
    const { sessions: _, ...rest } = ds;
    daySummaries.push({ date, json: rest });
  }

  const nonEmpty = daySummaries.filter((d) => d.json.highlights.length > 0);
  if (nonEmpty.length === 0) {
    return {
      week,
      highlights: [],
      topProjects: [],
      trends: [],
      dailyBreakdown: [],
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      week,
      highlights: [],
      topProjects: [],
      trends: [],
      dailyBreakdown: [],
    };
  }

  const { model } = getSettings();
  const result = await generateWeekSummary(week, nonEmpty, apiKey, model);
  writeSummary(`week:${week}`, 'week', JSON.stringify(result));
  return { week, ...result };
}

export async function getMonthSummary(month: string): Promise<MonthSummary> {
  const cached = readSummary(`month:${month}`);
  if (cached && !cached.stale) {
    return { month, ...JSON.parse(cached.json) };
  }

  const weeks = monthToWeeks(month);
  const weekSummaries: {
    week: string;
    json: WeekSummary;
  }[] = [];
  for (const week of weeks) {
    const ws = await getWeekSummary(week);
    weekSummaries.push({ week, json: ws });
  }

  const nonEmpty = weekSummaries.filter((w) => w.json.highlights.length > 0);
  if (nonEmpty.length === 0) {
    return {
      month,
      highlights: [],
      topProjects: [],
      trends: [],
      weeklyBreakdown: [],
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      month,
      highlights: [],
      topProjects: [],
      trends: [],
      weeklyBreakdown: [],
    };
  }

  const { model } = getSettings();
  const result = await generateMonthSummary(month, nonEmpty, apiKey, model);
  writeSummary(`month:${month}`, 'month', JSON.stringify(result));
  return { month, ...result };
}

function weekToDates(week: string): string[] {
  const [yearStr, weekStr] = week.split('-W');
  const year = Number(yearStr);
  const weekNum = Number(weekStr);
  // ISO 8601: week 1 contains January 4
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + (weekNum - 1) * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function monthToWeeks(month: string): string[] {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr) - 1;
  const weeks = new Set<string>();

  const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthNum, day);
    const weekKey = dateToWeekKey(d.toISOString().slice(0, 10));
    weeks.add(weekKey);
  }
  return [...weeks].sort();
}
