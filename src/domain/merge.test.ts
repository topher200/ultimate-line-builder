import { describe, expect, it } from 'vitest';
import { mergeLogs } from './merge.ts';
import type { EventEnvelope, EventPayload } from './types.ts';

function ev(
  id: string,
  payload: EventPayload,
  deviceId = 'd1',
  ts = 0,
): EventEnvelope {
  return { id, gameId: 'g', seq: 0, parentId: null, deviceId, ts, payload };
}

function pt(id: string, deviceId = 'd1', ts = 0): EventEnvelope {
  return ev(
    id,
    {
      kind: 'PointCompleted',
      lineup: [{ playerId: 'x' }],
      possession: 'O',
      majority: 'M',
      scoredBy: 'us',
    },
    deviceId,
    ts,
  );
}

const start = ev('s', {
  kind: 'GameStarted',
  startingPossession: 'O',
  startingMajority: 'M',
  expectedPoints: 20,
  mode: 0,
});

describe('mergeLogs', () => {
  it('keeps the longer log when one extends the other', () => {
    const a = [start, pt('p1')];
    const b = [start, pt('p1'), pt('p2')];
    expect(mergeLogs(a, b).merged).toBe(b);
    expect(mergeLogs(b, a).merged).toBe(b);
    expect(mergeLogs(a, b).discarded).toEqual([]);
  });

  it('keeps the branch with more points when they diverge', () => {
    const a = [start, pt('p1'), pt('a2')];
    const b = [start, pt('p1'), pt('b2'), pt('b3')];
    const result = mergeLogs(a, b);
    expect(result.merged).toBe(b);
    expect(result.discarded).toEqual([pt('a2')]);
  });

  it('breaks an equal-point tie by the later event', () => {
    const a = [start, pt('a2', 'd1', 5)];
    const b = [start, pt('b2', 'd2', 10)];
    expect(mergeLogs(a, b).merged).toBe(b);
    expect(mergeLogs(a, b).discarded[0].id).toBe('a2');
  });

  it('is a no-op discard for identical logs', () => {
    const a = [start, pt('p1')];
    const b = [start, pt('p1')];
    const result = mergeLogs(a, b);
    expect(result.discarded).toEqual([]);
  });
});
