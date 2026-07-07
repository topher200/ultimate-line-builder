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
    ...over,
  };
}

// 5 MMP + 5 WMP, split across O and D lines.
const roster: Player[] = [
  player('mo1', 'MMP', 'O', 1),
  player('mo2', 'MMP', 'O', 0.8),
  player('md1', 'MMP', 'D', 0.9),
  player('md2', 'MMP', 'D', 0.5),
  player('md3', 'MMP', 'D', 0.2),
  player('wo1', 'WMP', 'O', 1),
  player('wo2', 'WMP', 'O', 0.7),
  player('wd1', 'WMP', 'D', 0.9),
  player('wd2', 'WMP', 'D', 0.4),
  player('wd3', 'WMP', 'D', 0.1),
];

describe('weightForMode', () => {
  it('is the rating when competitive, uniform when equal, inverse when non-comp', () => {
    expect(weightForMode(0.8, 0)).toBeCloseTo(0.8);
    expect(weightForMode(0.8, 0.5)).toBeCloseTo(0.5);
    expect(weightForMode(0.8, 1)).toBeCloseTo(0.2);
  });
});

describe('computeTargets', () => {
  it('gives higher goals to higher-rated players in competitive mode', () => {
    const t = computeTargets(roster, 20, 0);
    expect(t['mo1']).toBeGreaterThan(t['md3']);
  });

  it('equalizes goals within a gender in equal mode', () => {
    const t = computeTargets(roster, 20, 0.5);
    expect(t['mo1']).toBeCloseTo(t['md3']);
  });

  it('never exceeds the number of points in the game', () => {
    const t = computeTargets(roster, 20, 0);
    for (const v of Object.values(t)) expect(v).toBeLessThanOrEqual(20);
  });
});

describe('selectLine', () => {
  const targets = computeTargets(roster, 20, 0);

  it('fills the 4:3 ratio for an M-majority point', () => {
    const ctx: PointContext = { possession: 'D', majority: 'M' };
    const { lineup } = selectLine(state({ mode: 0 }), roster, ctx, targets);
    expect(lineup).toHaveLength(7);
    const byGender = countGenders(lineup.map((l) => l.playerId));
    expect(byGender).toEqual({ MMP: 4, WMP: 3 });
  });

  it('prefers matching-line players in competitive mode', () => {
    const ctx: PointContext = { possession: 'O', majority: 'W' }; // 3 MMP, 4 WMP
    const { lineup } = selectLine(state({ mode: 0 }), roster, ctx, targets);
    const ids = lineup.map((l) => l.playerId);
    // Only 2 O-line MMPs exist, so the 3rd MMP slot backfills from D-line.
    expect(ids).toContain('mo1');
    expect(ids).toContain('mo2');
    expect(ids).toContain('wo1');
    expect(ids).toContain('wo2');
  });

  it('prioritizes players furthest behind their target', () => {
    const ctx: PointContext = { possession: 'D', majority: 'M' };
    // mo1 has already played a lot; mo2 has not -> mo2 should be picked.
    const s = state({ mode: 0, played: { mo1: 15, mo2: 0 } });
    const { lineup } = selectLine(s, roster, ctx, targets);
    expect(lineup.map((l) => l.playerId)).toContain('mo2');
  });

  it('forces in a player who has not played this half when the half runs short', () => {
    const ctx: PointContext = { possession: 'O', majority: 'M' };
    // Late in the half, everyone has a half point except md3 (lowest rated).
    const s = state({
      mode: 0,
      pointsPlayedThisHalf: 9,
      playedThisHalf: { mo1: 3, mo2: 3, md1: 3, md2: 1, wo1: 3, wo2: 2, wd1: 2, wd2: 2, wd3: 1 },
    });
    const { lineup } = selectLine(s, roster, ctx, targets);
    expect(lineup.map((l) => l.playerId)).toContain('md3');
  });

  it('flags short when a gender cannot be filled', () => {
    const tiny = [player('m1', 'MMP', 'O', 1), player('w1', 'WMP', 'O', 1)];
    const ctx: PointContext = { possession: 'O', majority: 'M' };
    const { short } = selectLine(state(), tiny, ctx, computeTargets(tiny, 20, 0));
    expect(short).toBe(true);
  });

  it('ignores inactive players', () => {
    const injured = roster.map((p) =>
      p.id === 'mo1' ? { ...p, active: false } : p,
    );
    const ctx: PointContext = { possession: 'O', majority: 'M' };
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

  it('predicts more points for higher-rated players in competitive mode', () => {
    const targets = computeTargets(roster, 20, 0);
    const predicted = predictGame(state({ mode: 0 }), roster, targets);
    expect(predicted['mo1']).toBeGreaterThan(predicted['md3']);
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
