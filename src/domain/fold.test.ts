import { describe, expect, it } from 'vitest';
import { deriveState } from './fold.ts';
import type { EventEnvelope, EventPayload } from './types.ts';

let seq = 0;
function ev(payload: EventPayload, id = `e${seq}`): EventEnvelope {
  return {
    id,
    gameId: 'g1',
    seq: seq++,
    parentId: null,
    deviceId: 'd1',
    ts: seq,
    payload,
  };
}

function point(
  players: string[],
  scoredBy: 'us' | 'them',
  possession: 'O' | 'D',
  majority: 'M' | 'W',
  id?: string,
): EventEnvelope {
  return ev(
    {
      kind: 'PointCompleted',
      lineup: players.map((playerId) => ({ playerId })),
      possession,
      majority,
      scoredBy,
    },
    id,
  );
}

const start = ev({
  kind: 'GameStarted',
  startingPossession: 'D',
  startingMajority: 'M',
  expectedPoints: 20,
  mode: 0,
});

describe('deriveState', () => {
  it('returns defaults for an empty log', () => {
    const s = deriveState([]);
    expect(s.totalPoints).toBe(0);
    expect(s.expectedPoints).toBe(20);
    expect(s.nextPossession).toBe('O');
  });

  it('applies GameStarted config and first-point context', () => {
    const s = deriveState([start]);
    expect(s.nextPossession).toBe('D');
    expect(s.nextMajority).toBe('M');
    expect(s.mode).toBe(0);
  });

  it('lets StartConfigChanged correct the starting possession and majority', () => {
    const s = deriveState([
      start,
      ev({ kind: 'StartConfigChanged', startingPossession: 'O', startingMajority: 'W' }),
    ]);
    expect(s.startingPossession).toBe('O');
    expect(s.startingMajority).toBe('W');
    expect(s.nextPossession).toBe('O');
    expect(s.nextMajority).toBe('W');
  });

  it('counts players and tracks score and next possession after a point', () => {
    const s = deriveState([start, point(['a', 'b'], 'us', 'D', 'M')]);
    expect(s.played).toEqual({ a: 1, b: 1 });
    expect(s.score).toEqual({ us: 1, them: 0 });
    expect(s.totalPoints).toBe(1);
    expect(s.nextPossession).toBe('D'); // we scored -> we pull -> D
  });

  it('goes to O after they score', () => {
    const s = deriveState([start, point(['a'], 'them', 'D', 'M')]);
    expect(s.nextPossession).toBe('O');
  });

  it('has an empty mode baseline before any ModeChanged', () => {
    const s = deriveState([start, point(['a'], 'us', 'D', 'M')]);
    expect(s.modeBaseline).toEqual({ totalPoints: 0, played: {} });
  });

  it('snapshots the mode baseline at the latest ModeChanged', () => {
    const s = deriveState([
      start,
      point(['a'], 'us', 'D', 'M'),
      point(['a', 'b'], 'them', 'O', 'W'),
      ev({ kind: 'ModeChanged', value: 0.5 }),
      point(['c'], 'us', 'D', 'M'),
    ]);
    // Baseline is pinned to the moment the mode changed (2 points in), not now.
    expect(s.modeBaseline.totalPoints).toBe(2);
    expect(s.modeBaseline.played).toEqual({ a: 2, b: 1 });
    expect(s.totalPoints).toBe(3);
  });

  it('credits both players on an injury sub (>7 entries)', () => {
    const inj = ev({
      kind: 'PointCompleted',
      lineup: [
        { playerId: 'a' },
        { playerId: 'sub', injurySubFor: 'a' },
        { playerId: 'b' },
      ],
      possession: 'D',
      majority: 'M',
      scoredBy: 'us',
    });
    const s = deriveState([start, inj]);
    expect(s.played).toEqual({ a: 1, sub: 1, b: 1 });
  });

  it('skips undone points', () => {
    const p = point(['a'], 'us', 'D', 'M', 'p1');
    const undo: EventPayload = { kind: 'Undone', targetId: 'p1' };
    const s = deriveState([start, p, ev(undo)]);
    expect(s.totalPoints).toBe(0);
    expect(s.played).toEqual({});
    expect(s.score).toEqual({ us: 0, them: 0 });
  });

  it('steps back through points as each is undone', () => {
    const p1 = point(['a'], 'us', 'D', 'M', 'p1');
    const p2 = point(['b'], 'them', 'O', 'W', 'p2');
    const afterOneUndo = deriveState([
      start,
      p1,
      p2,
      ev({ kind: 'Undone', targetId: 'p2' }),
    ]);
    expect(afterOneUndo.totalPoints).toBe(1);
    expect(afterOneUndo.score).toEqual({ us: 1, them: 0 });
    const afterTwoUndos = deriveState([
      start,
      p1,
      p2,
      ev({ kind: 'Undone', targetId: 'p2' }),
      ev({ kind: 'Undone', targetId: 'p1' }),
    ]);
    expect(afterTwoUndos.totalPoints).toBe(0);
    expect(afterTwoUndos.score).toEqual({ us: 0, them: 0 });
  });

  it('reverts to the first half when the half start is undone', () => {
    const half = ev({ kind: 'HalfStarted' }, 'h1');
    const s = deriveState([
      start,
      point(['a'], 'us', 'D', 'M'),
      half,
      ev({ kind: 'Undone', targetId: 'h1' }),
    ]);
    expect(s.half).toBe(1);
    expect(s.pointsPlayedThisHalf).toBe(1);
    expect(s.playedThisHalf).toEqual({ a: 1 });
  });

  it('resets half counts and flips possession at the second half', () => {
    const s = deriveState([
      start,
      point(['a'], 'us', 'D', 'M'),
      ev({ kind: 'HalfStarted' }),
    ]);
    expect(s.half).toBe(2);
    expect(s.pointsPlayedThisHalf).toBe(0);
    expect(s.playedThisHalf).toEqual({ a: 0 });
    expect(s.nextPossession).toBe('O'); // started game on D -> half opens O
    expect(s.nextMajority).toBe('W'); // ratio pattern continues across half: point 2 = W
  });

  it('honors a pending majority override for the next point only', () => {
    const s = deriveState([start, ev({ kind: 'MajorityOverridden', value: 'W' })]);
    expect(s.nextMajority).toBe('W');
    const s2 = deriveState([
      start,
      ev({ kind: 'MajorityOverridden', value: 'W' }),
      point(['a'], 'us', 'D', 'W'),
    ]);
    expect(s2.nextMajority).toBe('W'); // point 2 in half: pattern B = opposite of M
  });
});
