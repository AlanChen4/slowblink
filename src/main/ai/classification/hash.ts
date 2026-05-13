import { createHash } from 'node:crypto';
import { normalizeFocusedWindow } from '../../../shared/overview/segmenter';
import type { Segment } from '../../../shared/types';

const UNIT_SEPARATOR = '\x1f';

export function segmentHash(
  seg: Pick<Segment, 'focusedApp' | 'focusedWindow'>,
  activities: string[],
): string {
  const app = seg.focusedApp ?? '';
  const window =
    normalizeFocusedWindow(seg.focusedWindow, seg.focusedApp) ?? '';
  const activityKey = [...new Set(activities)].toSorted().join('\n');
  const composite = [app, window, activityKey].join(UNIT_SEPARATOR);
  return createHash('sha256').update(composite).digest('hex');
}
