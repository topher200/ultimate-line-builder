import type {
  EventEnvelope,
  LineupEntry,
  MajorityGender,
  Possession,
} from './types.ts';

export interface PlayedPoint {
  /** 1-based position among completed points. */
  index: number;
  eventId: string;
  lineup: LineupEntry[];
  possession: Possession;
  majority: MajorityGender;
  scoredBy: 'us' | 'them';
  scoreAfter: { us: number; them: number };
}

/**
 * The points actually played this game, in order, skipping undone ones. Each
 * carries the line that was on the field and the running score after it.
 */
export function playedPoints(events: EventEnvelope[]): PlayedPoint[] {
  const undone = new Set<string>();
  for (const e of events) {
    if (e.payload.kind === 'Undone') undone.add(e.payload.targetId);
  }

  const out: PlayedPoint[] = [];
  let us = 0;
  let them = 0;
  for (const e of events) {
    if (e.payload.kind !== 'PointCompleted' || undone.has(e.id)) continue;
    const p = e.payload;
    if (p.scoredBy === 'us') us += 1;
    else them += 1;
    out.push({
      index: out.length + 1,
      eventId: e.id,
      lineup: p.lineup,
      possession: p.possession,
      majority: p.majority,
      scoredBy: p.scoredBy,
      scoreAfter: { us, them },
    });
  }
  return out;
}
