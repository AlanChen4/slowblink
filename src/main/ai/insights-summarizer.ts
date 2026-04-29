import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { Session } from '../../shared/types';
import { getSamples, getSessions, updateSessionSummary } from '../db';

const SessionSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      'One or two sentences summarizing what the user was doing during this session and why (if apparent from context).',
    ),
});

const DaySummarySchema = z.object({
  highlights: z
    .array(z.string())
    .describe('3-5 main things accomplished or spent time on'),
  topProjects: z.array(
    z.object({
      project: z.string(),
      durationMinutes: z.number(),
      description: z.string(),
    }),
  ),
  patterns: z
    .array(z.string())
    .describe(
      'Notable patterns like "spent 2 hours on reddit after lunch" or "context-switched frequently between 2-4pm"',
    ),
  categoryBreakdown: z
    .array(
      z.object({
        category: z.string(),
        minutes: z.number(),
      }),
    )
    .describe('Minutes per category'),
});

const WeekSummarySchema = z.object({
  highlights: z
    .array(z.string())
    .describe('3-5 key themes or accomplishments for the week'),
  topProjects: z.array(
    z.object({
      project: z.string(),
      durationMinutes: z.number(),
      description: z.string(),
    }),
  ),
  trends: z
    .array(z.string())
    .describe(
      'Notable trends compared across days, like "most productive on Tuesday" or "reddit usage increased toward end of week"',
    ),
  dailyBreakdown: z.array(
    z.object({
      date: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
});

const MonthSummarySchema = z.object({
  highlights: z
    .array(z.string())
    .describe('3-5 key themes or accomplishments for the month'),
  topProjects: z.array(
    z.object({
      project: z.string(),
      durationMinutes: z.number(),
      description: z.string(),
    }),
  ),
  trends: z.array(z.string()).describe('Notable trends across the month'),
  weeklyBreakdown: z.array(
    z.object({
      week: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
});

export { DaySummarySchema, MonthSummarySchema, WeekSummarySchema };

type ModelFactory = (
  apiKey: string,
  modelId: string,
) => Promise<Parameters<typeof generateText>[0]['model']>;

let getModel: ModelFactory | null = null;

export function setModelFactory(factory: ModelFactory): void {
  getModel = factory;
}

async function requireModel(apiKey: string, modelId: string) {
  if (!getModel)
    throw new Error('Model factory not set — call setModelFactory first');
  return getModel(apiKey, modelId);
}

function selectRepresentativeSamples(
  samples: import('../../shared/types').Sample[],
): string[] {
  const format = (s: import('../../shared/types').Sample) =>
    `[${s.category}] ${s.activity}${s.detail ? ` (${s.detail})` : ''}`;

  if (samples.length <= 50) return samples.map(format);

  const first5 = samples.slice(0, 5);
  const last5 = samples.slice(-5);
  const step = Math.floor(samples.length / 20);
  const middle = [];
  for (let i = 5; i < samples.length - 5 && middle.length < 20; i += step) {
    middle.push(samples[i]);
  }
  return [...first5, ...middle, ...last5].map(format);
}

function findNeighborSessions(session: Session) {
  const neighbors = getSessions(
    session.startTs - 4 * 60 * 60 * 1000,
    session.endTs + 4 * 60 * 60 * 1000,
  );
  const idx = neighbors.findIndex((s) => s.id === session.id);
  return {
    prev: idx > 0 ? neighbors[idx - 1] : null,
    next: idx < neighbors.length - 1 ? neighbors[idx + 1] : null,
  };
}

export async function summarizeSession(
  session: Session,
  apiKey: string,
  modelId: string,
): Promise<string> {
  const samples = getSamples(session.startTs, session.endTs + 1);
  const sampleActivities = selectRepresentativeSamples(samples);
  const { prev, next } = findNeighborSessions(session);

  const durationMin = Math.round(session.durationMs / 60000);
  const app = session.primaryApp ?? 'unknown app';
  const cat = session.primaryCategory;
  const project = session.primaryProject
    ? ` on project "${session.primaryProject}"`
    : '';

  const prompt = `You are summarizing a computer activity session.

Previous session: ${prev?.summary ?? 'N/A'}

Current session (${durationMin} minutes, primarily ${cat} in ${app}${project}):
${sampleActivities.join('\n')}

Next session: ${next?.summary ?? 'N/A'}

Write one or two sentences summarizing what the user was doing and why (if apparent from context).`;

  const { output } = await generateText({
    model: await requireModel(apiKey, modelId),
    output: Output.object({ schema: SessionSummarySchema }),
    messages: [{ role: 'user', content: prompt }],
  });

  const summary = output.summary;
  updateSessionSummary(session.id, summary, Date.now());
  return summary;
}

export async function generateDaySummary(
  date: string,
  sessions: Session[],
  apiKey: string,
  modelId: string,
): Promise<z.infer<typeof DaySummarySchema>> {
  const sessionDescriptions = sessions.map((s) => {
    const start = new Date(s.startTs).toLocaleTimeString();
    const end = new Date(s.endTs).toLocaleTimeString();
    const dur = Math.round(s.durationMs / 60000);
    const proj = s.primaryProject ? ` [${s.primaryProject}]` : '';
    return `${start}–${end} (${dur}min): ${s.summary ?? `${s.primaryCategory} in ${s.primaryApp ?? 'unknown'}`}${proj}`;
  });

  const totalMinutes = Math.round(
    sessions.reduce((a, s) => a + s.durationMs, 0) / 60000,
  );

  const prompt = `Summarize this day's computer activity (${date}, ${totalMinutes} total minutes across ${sessions.length} sessions):

${sessionDescriptions.join('\n')}

Provide highlights (3-5 main accomplishments/activities), top projects with durations, notable patterns, and a category breakdown in minutes.`;

  const { output } = await generateText({
    model: await requireModel(apiKey, modelId),
    output: Output.object({ schema: DaySummarySchema }),
    messages: [{ role: 'user', content: prompt }],
  });
  return output;
}

export async function generateWeekSummary(
  week: string,
  daySummaries: { date: string; json: z.infer<typeof DaySummarySchema> }[],
  apiKey: string,
  modelId: string,
): Promise<z.infer<typeof WeekSummarySchema>> {
  const dayDescriptions = daySummaries.map(
    (d) =>
      `${d.date}:\n  Highlights: ${d.json.highlights.join('; ')}\n  Top projects: ${d.json.topProjects.map((p) => `${p.project} (${p.durationMinutes}min)`).join(', ')}`,
  );

  const prompt = `Summarize this week's computer activity (${week}):

${dayDescriptions.join('\n\n')}

Provide weekly highlights, top projects with total durations, trends across days, and a brief daily breakdown.`;

  const { output } = await generateText({
    model: await requireModel(apiKey, modelId),
    output: Output.object({ schema: WeekSummarySchema }),
    messages: [{ role: 'user', content: prompt }],
  });
  return output;
}

export async function generateMonthSummary(
  month: string,
  weekSummaries: { week: string; json: z.infer<typeof WeekSummarySchema> }[],
  apiKey: string,
  modelId: string,
): Promise<z.infer<typeof MonthSummarySchema>> {
  const weekDescriptions = weekSummaries.map(
    (w) =>
      `${w.week}:\n  Highlights: ${w.json.highlights.join('; ')}\n  Top projects: ${w.json.topProjects.map((p) => `${p.project} (${p.durationMinutes}min)`).join(', ')}`,
  );

  const prompt = `Summarize this month's computer activity (${month}):

${weekDescriptions.join('\n\n')}

Provide monthly highlights, top projects with total durations, trends across weeks, and a brief weekly breakdown.`;

  const { output } = await generateText({
    model: await requireModel(apiKey, modelId),
    output: Output.object({ schema: MonthSummarySchema }),
    messages: [{ role: 'user', content: prompt }],
  });
  return output;
}
