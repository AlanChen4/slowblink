import type { Category } from '@shared/types';

export const CATEGORY_COLORS: Record<Category, string> = {
  coding: 'bg-emerald-500',
  writing: 'bg-sky-500',
  communication: 'bg-amber-500',
  browsing: 'bg-violet-500',
  meeting: 'bg-rose-500',
  media: 'bg-pink-500',
  design: 'bg-cyan-500',
  other: 'bg-zinc-500',
};

export function startOfDay(d = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
