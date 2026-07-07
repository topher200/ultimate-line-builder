import { describe, expect, it } from 'vitest';
import { sameDay, sumPlayedAcross } from './aggregate.ts';
import type { EventEnvelope, EventPayload } from './types.ts';

let seq = 0;
function ev(payload: EventPayload): EventEnvelope {
  return { id: `e${seq}`, gameId: 'g', seq: seq++, parentId: null, deviceId: 'd', ts: seq, payload };
}

function log(players: string[][]): EventEnvelope[] {
  const start = ev({
    kind: 'GameStarted',
    startingPossession: 'O',
    startingMajority: 'M',
    expectedPoints: 20,
    mode: 0,
  });
  const points = players.map((ids) =>
    ev({
      kind: 'PointCompleted',
      lineup: ids.map((playerId) => ({ playerId })),
      possession: 'O',
      majority: 'M',
      scoredBy: 'us',
    }),
  );
  return [start, ...points];
}

describe('sumPlayedAcross', () => {
  it('adds up a player across multiple games', () => {
    const g1 = log([['a', 'b'], ['a']]); // a:2 b:1
    const g2 = log([['a', 'c']]); // a:1 c:1
    expect(sumPlayedAcross([g1, g2])).toEqual({ a: 3, b: 1, c: 1 });
  });

  it('returns empty for no games', () => {
    expect(sumPlayedAcross([])).toEqual({});
  });
});

describe('sameDay', () => {
  it('is true within a calendar day and false across days', () => {
    const morning = new Date(2026, 6, 6, 9).getTime();
    const evening = new Date(2026, 6, 6, 20).getTime();
    const nextDay = new Date(2026, 6, 7, 9).getTime();
    expect(sameDay(morning, evening)).toBe(true);
    expect(sameDay(morning, nextDay)).toBe(false);
  });
});
