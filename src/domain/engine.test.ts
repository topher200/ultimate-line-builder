import { describe, expect, it } from 'vitest';
import {
  computeTargets,
  predictGame,
  selectLine,
  weightForMode,
} from './engine.ts';
import type { GameState, Gender, Line, Player, PointContext } from './types.ts';

function player(
  id: string,
  gender: Gender,
  line: Line,
  competitiveness: number,
  active = true,
): Player {
  return { id, name: id, gender, line, competitiveness, active };
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    expectedPoints: 20,
    mode: 0,
    startingPossession: 'O',
    startingMajority: 'M',
    half: 1,
    totalPoints: 0,
    score: { us: 0, them: 0 },
    played: {},
    playedThisHalf: {},
    pointsPlayedThisHalf: 0,
    nextPossession: 'O',
    nextMajority: 'M',
    modeBaseline: { totalPoints: 0, played: {} },
    ...over,
  };
}

// 4 MMP + 4 WMP on each line, so either line can field any 4:3 / 3:4 ratio.
const roster: Player[] = [
  player('mo1', 'MMP', 'O', 1),
  player('mo2', 'MMP', 'O', 0.8),
  player('mo3', 'MMP', 'O', 0.6),
  player('mo4', 'MMP', 'O', 0.4),
  player('wo1', 'WMP', 'O', 1),
  player('wo2', 'WMP', 'O', 0.7),
  player('wo3', 'WMP', 'O', 0.5),
  player('wo4', 'WMP', 'O', 0.3),
  player('md1', 'MMP', 'D', 0.9),
  player('md2', 'MMP', 'D', 0.5),
  player('md3', 'MMP', 'D', 0.3),
  player('md4', 'MMP', 'D', 0.2),
  player('wd1', 'WMP', 'D', 0.9),
  player('wd2', 'WMP', 'D', 0.4),
  player('wd3', 'WMP', 'D', 0.2),
  player('wd4', 'WMP', 'D', 0.1),
];

describe('weightForMode', () => {
  it('is the rating when competitive, uniform when equal, inverse when non-comp', () => {
    expect(weightForMode(0.8, 0)).toBeCloseTo(0.8);
    expect(weightForMode(0.8, 0.5)).toBeCloseTo(0.5);
    expect(weightForMode(0.8, 1)).toBeCloseTo(0.2);
  });
});

describe('computeTargets', () => {
  it('gives higher goals to higher-rated players on a line', () => {
    const t = computeTargets(roster, 20, 0);
    expect(t['mo1']).toBeGreaterThan(t['mo4']);
  });

  it('equalizes goals within a line and gender in equal mode', () => {
    const t = computeTargets(roster, 20, 0.5);
    expect(t['mo1']).toBeCloseTo(t['mo4']);
  });

  it('never exceeds the number of points in the game', () => {
    const t = computeTargets(roster, 20, 0);
    for (const v of Object.values(t)) expect(v).toBeLessThanOrEqual(20);
  });

  it('always scopes goals per line, so a smaller line means bigger goals', () => {
    // 2 O-line MMPs share O points; 4 D-line MMPs share D points. Same rating.
    const uneven: Player[] = [
      player('o1', 'MMP', 'O', 0.5),
      player('o2', 'MMP', 'O', 0.5),
      player('d1', 'MMP', 'D', 0.5),
      player('d2', 'MMP', 'D', 0.5),
      player('d3', 'MMP', 'D', 0.5),
      player('d4', 'MMP', 'D', 0.5),
    ];
    // Holds even in equal mode: lines never pool together.
    expect(computeTargets(uneven, 20, 0)['o1']).toBeGreaterThan(
      computeTargets(uneven, 20, 0)['d1'],
    );
    expect(computeTargets(uneven, 20, 0.5)['o1']).toBeGreaterThan(
      computeTargets(uneven, 20, 0.5)['d1'],
    );
  });

  it('re-plans only the remaining points from the mode baseline (going forward)', () => {
    const pool = [player('a', 'MMP', 'O', 0.5), player('b', 'MMP', 'O', 0.5)];
    // After 10 points, switch to equal: a has played 8, b has played 0.
    const baseline = { totalPoints: 10, played: { a: 8, b: 0 } };
    const t = computeTargets(pool, 20, 0.5, 0.5, baseline);
    // a keeps the head start it earned...
    expect(t['a']).toBeGreaterThan(t['b']);
    // ...but still has a positive remaining share, so it is not benched.
    expect(t['a']).toBeGreaterThan(8);
  });
});

describe('selectLine', () => {
  const targets = computeTargets(roster, 20, 0);

  it('fills the 4:3 ratio from the fielded line only', () => {
    const ctx: PointContext = { possession: 'D', majority: 'M', line: 'D' };
    const { lineup } = selectLine(state({ mode: 0 }), roster, ctx, targets);
    expect(lineup).toHaveLength(7);
    const chosen = lineup.map((l) => roster.find((r) => r.id === l.playerId)!);
    expect(chosen.every((p) => p.line === 'D')).toBe(true);
    expect(countGenders(lineup.map((l) => l.playerId))).toEqual({ MMP: 4, WMP: 3 });
  });

  it('fields the D line on an offense point when called manually', () => {
    // possession is O, but the coach called the D line.
    const ctx: PointContext = { possession: 'O', majority: 'M', line: 'D' };
    const { lineup } = selectLine(state({ mode: 0 }), roster, ctx, targets);
    const chosen = lineup.map((l) => roster.find((r) => r.id === l.playerId)!);
    expect(chosen.every((p) => p.line === 'D')).toBe(true);
  });

  it('prioritizes players furthest behind their target', () => {
    const ctx: PointContext = { possession: 'D', majority: 'M', line: 'D' };
    // Equal targets so only playing time (not rating) drives the pick.
    const eqTargets = computeTargets(roster, 20, 0.5);
    // Everyone has a half point (no urgency); wd1 is heavily over-played.
    const s = state({
      pointsPlayedThisHalf: 6,
      played: { wd1: 15 },
      playedThisHalf: { wd1: 3, wd2: 3, wd3: 3, wd4: 3, md1: 3, md2: 3, md3: 3, md4: 3 },
    });
    // Only 3 of 4 D-line WMP slots are filled, so the over-played one drops.
    expect(
      selectLine(s, roster, ctx, eqTargets).lineup.map((l) => l.playerId),
    ).not.toContain('wd1');
  });

  it('forces in a player who has not played this half when the half runs short', () => {
    const ctx: PointContext = { possession: 'D', majority: 'M', line: 'D' };
    // Late in the half, every D-line WMP has a half point except wd4 (lowest rated).
    const s = state({
      mode: 0,
      pointsPlayedThisHalf: 9,
      playedThisHalf: { wd1: 3, wd2: 2, wd3: 2 },
    });
    expect(selectLine(s, roster, ctx, targets).lineup.map((l) => l.playerId)).toContain(
      'wd4',
    );
  });

  it('flags short when the fielded line cannot fill a gender (no cross-line backfill)', () => {
    const ctx: PointContext = { possession: 'O', majority: 'M', line: 'O' };
    const tiny = [player('m1', 'MMP', 'O', 1), player('w1', 'WMP', 'O', 1)];
    const { short } = selectLine(state(), tiny, ctx, computeTargets(tiny, 20, 0));
    expect(short).toBe(true);
  });

  it('ignores inactive players', () => {
    const injured = roster.map((p) => (p.id === 'mo1' ? { ...p, active: false } : p));
    const ctx: PointContext = { possession: 'O', majority: 'M', line: 'O' };
    const { lineup } = selectLine(state(), injured, ctx, targets);
    expect(lineup.map((l) => l.playerId)).not.toContain('mo1');
  });
});

describe('predictGame', () => {
  it('projects a full game worth of player-points and never predicts below played', () => {
    const targets = computeTargets(roster, 20, 0);
    const s = state({ mode: 0 });
    const predicted = predictGame(s, roster, targets);
    const total = Object.values(predicted).reduce((a, b) => a + b, 0);
    expect(total).toBe(7 * 20);
    for (const p of roster) {
      expect(predicted[p.id]).toBeGreaterThanOrEqual(s.played[p.id] ?? 0);
    }
  });

  it('predicts more points for higher-rated players on a line in competitive mode', () => {
    const targets = computeTargets(roster, 20, 0);
    const predicted = predictGame(state({ mode: 0 }), roster, targets);
    expect(predicted['mo1']).toBeGreaterThan(predicted['mo4']);
  });

  it('forcing O possession favors O-line players over D-line', () => {
    const targets = computeTargets(roster, 20, 0);
    const s = state({ mode: 0 });
    const oOnly = predictGame(s, roster, targets, { forcePossession: 'O' });
    const dOnly = predictGame(s, roster, targets, { forcePossession: 'D' });
    // With every point on offense, only the O line plays.
    expect(oOnly['mo1']).toBeGreaterThan(dOnly['mo1']);
    expect(dOnly['mo1']).toBe(0);
    const total = Object.values(oOnly).reduce((a, b) => a + b, 0);
    expect(total).toBe(7 * 20);
  });
});

function countGenders(ids: string[]): Record<Gender, number> {
  const out: Record<Gender, number> = { MMP: 0, WMP: 0 };
  for (const id of ids) {
    const p = roster.find((r) => r.id === id);
    if (p) out[p.gender]++;
  }
  return out;
}
