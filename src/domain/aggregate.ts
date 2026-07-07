import { deriveState } from './fold.ts';
import type { EventEnvelope, Id } from './types.ts';

/** Sum per-player played counts across several game logs (day / tournament). */
export function sumPlayedAcross(
  logs: EventEnvelope[][],
): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const log of logs) {
    const { played } = deriveState(log);
    for (const [id, n] of Object.entries(played)) {
      out[id] = (out[id] ?? 0) + n;
    }
  }
  return out;
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
