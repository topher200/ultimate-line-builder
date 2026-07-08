import { deriveState } from './fold.ts';
import type { EventEnvelope } from './types.ts';

export interface MergeResult {
  merged: EventEnvelope[];
  /** The losing branch's diverging tail, kept so nothing is silently lost. */
  discarded: EventEnvelope[];
}

/**
 * Reconcile two views of one game's log (longest chain wins).
 *
 * They share a common prefix (events are immutable and identified by id). If one
 * log simply extends the other, keep the longer. If they diverged after the
 * prefix, keep the branch with more completed points; ties break by the later
 * event, then the larger deviceId. The losing tail is returned in `discarded`
 * rather than dropped. During a live game one device records every point, so the
 * extend case is the norm and true divergence is rare.
 */
export function mergeLogs(a: EventEnvelope[], b: EventEnvelope[]): MergeResult {
  const prefixLen = commonPrefixLength(a, b);
  const aTail = a.slice(prefixLen);
  const bTail = b.slice(prefixLen);

  if (aTail.length === 0) return { merged: b, discarded: [] };
  if (bTail.length === 0) return { merged: a, discarded: [] };

  const aWins = compareBranches(a, aTail, b, bTail) >= 0;
  return aWins
    ? { merged: a, discarded: bTail }
    : { merged: b, discarded: aTail };
}

/** Positive if branch a wins, negative if b wins. */
function compareBranches(
  a: EventEnvelope[],
  aTail: EventEnvelope[],
  b: EventEnvelope[],
  bTail: EventEnvelope[],
): number {
  const pointDiff = deriveState(a).totalPoints - deriveState(b).totalPoints;
  if (pointDiff !== 0) return pointDiff;

  const tsDiff = maxTs(aTail) - maxTs(bTail);
  if (tsDiff !== 0) return tsDiff;

  return lastDeviceId(aTail).localeCompare(lastDeviceId(bTail));
}

function commonPrefixLength(a: EventEnvelope[], b: EventEnvelope[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i].id === b[i].id) i++;
  return i;
}

function maxTs(events: EventEnvelope[]): number {
  return events.reduce((m, e) => Math.max(m, e.ts), 0);
}

function lastDeviceId(events: EventEnvelope[]): string {
  return events[events.length - 1]?.deviceId ?? '';
}
