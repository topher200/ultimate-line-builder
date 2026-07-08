import { majorityForPoint, slotsForMajority } from './rules.ts';
import type {
  GameState,
  Gender,
  Id,
  Line,
  LineupEntry,
  MajorityGender,
  Mode,
  ModeBaseline,
  Player,
  PointContext,
  Possession,
} from './types.ts';

/**
 * How much a player is favored this game, from their competitiveness rating
 * blended by the mode. mode 0 = competitive (rating), 0.5 = equal (uniform),
 * 1 = non-competitive (inverse rating: rest the stars).
 */
export function weightForMode(competitiveness: number, mode: Mode): number {
  const competitive = competitiveness;
  const equal = 0.5;
  const noncomp = 1 - competitiveness;
  const w =
    mode <= 0.5
      ? lerp(competitive, equal, mode / 0.5)
      : lerp(equal, noncomp, (mode - 0.5) / 0.5);
  // Keep a floor so a 0%-rated player can still be selected when owed a point.
  return Math.max(w, 0.001);
}

const NO_BASELINE: ModeBaseline = { totalPoints: 0, played: {} };

/**
 * Per-player goal: how many points we want them to play this game.
 *
 * Players only ever play with their own line (an O point is played by the O
 * line, a D point by the D line), so goals are always scoped per (line, gender)
 * pool over that line's share of the game. This keeps "predicted / goal"
 * consistent even when the two lines are different sizes. Mode only changes the
 * weighting within a pool, never who is in it.
 *
 * Goals distribute the points remaining after the mode baseline (the moment the
 * mode was last set) on top of what each player had already played then, so
 * changing the mode re-plans from that point forward instead of rewriting the
 * whole-game goal. With the default (start-of-game) baseline this is a plain
 * whole-game goal. `oShare` is the expected fraction of points played on offense
 * (defaults to an even split, which self-corrects as points fall).
 */
export function computeTargets(
  players: Player[],
  expectedPoints: number,
  mode: Mode,
  oShare = 0.5,
  baseline: ModeBaseline = NO_BASELINE,
): Record<Id, number> {
  const active = players.filter((p) => p.active);
  const targets: Record<Id, number> = {};
  const remaining = Math.max(0, expectedPoints - baseline.totalPoints);
  const remO = remaining * oShare;
  const remD = remaining - remO;

  for (const gender of ['MMP', 'WMP'] as Gender[]) {
    const perPoint = averageSlots(gender, expectedPoints);
    const ofGender = active.filter((p) => p.gender === gender);
    const assign = (pool: Player[], remInScope: number) =>
      assignPool(pool, perPoint, remInScope, mode, baseline.played, expectedPoints, targets);
    assign(ofGender.filter((p) => p.line === 'O'), remO);
    assign(ofGender.filter((p) => p.line === 'D'), remD);
  }
  return targets;
}

function assignPool(
  pool: Player[],
  perPointSlots: number,
  remainingInScope: number,
  mode: Mode,
  baselinePlayed: Record<Id, number>,
  cap: number,
  targets: Record<Id, number>,
): void {
  if (pool.length === 0) return;
  const weights = pool.map((p) => weightForMode(p.competitiveness, mode));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const remainingSlots = perPointSlots * remainingInScope;
  pool.forEach((p, i) => {
    const base = baselinePlayed[p.id] ?? 0;
    // Head start plus this pool's share of the remaining points, capped at the
    // whole game.
    targets[p.id] = Math.min(cap, base + (remainingSlots * weights[i]) / sum);
  });
}

export interface SelectionResult {
  lineup: LineupEntry[];
  /** Per chosen player, a short human reason. */
  reasons: Record<Id, string>;
  /** True when we could not fill a gender slot from the active roster. */
  short: boolean;
}

const URGENCY_WEIGHT = 1000;

/**
 * Choose the line for the upcoming point. Only the fielded line's players are
 * eligible (never a mix of O and D); within each gender we take the players
 * furthest behind their target, with a once-per-half urgency boost. The fielded
 * line defaults to the one matching possession but the coach can call the other
 * line manually (context.line). If the line is short a gender, the shortfall is
 * flagged rather than backfilled from the other line.
 */
export function selectLine(
  state: GameState,
  players: Player[],
  context: PointContext,
  targets: Record<Id, number>,
): SelectionResult {
  const slots = slotsForMajority(context.majority);
  const online = players.filter((p) => p.active && p.line === context.line);
  const lineup: LineupEntry[] = [];
  const reasons: Record<Id, string> = {};
  let short = false;

  const halfPointsLeft = estimateHalfPointsLeft(state);
  const needingHalfPoint = online.filter(
    (p) => (state.playedThisHalf[p.id] ?? 0) === 0,
  ).length;

  for (const gender of ['MMP', 'WMP'] as Gender[]) {
    const need = gender === 'MMP' ? slots.MMP : slots.WMP;
    const pool = online.filter((p) => p.gender === gender);
    const ranked = rankCandidates(pool, state, targets, needingHalfPoint, halfPointsLeft);
    const chosen = ranked.slice(0, need);
    if (chosen.length < need) short = true;
    for (const { player, reason } of chosen) {
      lineup.push({ playerId: player.id });
      reasons[player.id] = reason;
    }
  }

  return { lineup, reasons, short };
}

function rankCandidates(
  pool: Player[],
  state: GameState,
  targets: Record<Id, number>,
  needingHalfPoint: number,
  halfPointsLeft: number,
): { player: Player; reason: string; score: number }[] {
  const scored = pool.map((p) => {
    const played = state.played[p.id] ?? 0;
    const deficit = (targets[p.id] ?? 0) - played;
    const needsHalf = (state.playedThisHalf[p.id] ?? 0) === 0;
    const urgency = needsHalf
      ? (URGENCY_WEIGHT * needingHalfPoint) / Math.max(1, halfPointsLeft)
      : 0;
    const score = urgency + deficit;
    const reason = needsHalf ? 'needs a half point' : 'owed a point';
    return { player: p, reason, score };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (state.played[a.player.id] ?? 0) - (state.played[b.player.id] ?? 0) ||
      a.player.name.localeCompare(b.player.name),
  );
  return scored;
}

export interface PredictOptions {
  /** Force every simulated point to this possession (for O-only / D-only). */
  forcePossession?: Possession;
}

/**
 * Predicted points per player: run the selection policy forward over the
 * remaining points, assuming O and D points trade (possession alternates)
 * unless a possession is forced.
 */
export function predictGame(
  state: GameState,
  players: Player[],
  targets: Record<Id, number>,
  opts: PredictOptions = {},
): Record<Id, number> {
  const predicted: Record<Id, number> = {};
  for (const p of players) predicted[p.id] = state.played[p.id] ?? 0;

  const sim: GameState = {
    ...state,
    played: { ...state.played },
    playedThisHalf: { ...state.playedThisHalf },
    score: { ...state.score },
    nextPossession: opts.forcePossession ?? state.nextPossession,
  };

  let guard = 0;
  const halfLen = Math.ceil(state.expectedPoints / 2);
  while (sim.totalPoints < state.expectedPoints && guard++ < 200) {
    const context: PointContext = {
      possession: sim.nextPossession,
      majority: sim.nextMajority,
      // The simulation fields the line matching possession (no manual calls).
      line: sim.nextPossession,
    };
    const { lineup } = selectLine(sim, players, context, targets);
    for (const entry of lineup) {
      predicted[entry.playerId] = (predicted[entry.playerId] ?? 0) + 1;
      sim.played[entry.playerId] = (sim.played[entry.playerId] ?? 0) + 1;
      sim.playedThisHalf[entry.playerId] =
        (sim.playedThisHalf[entry.playerId] ?? 0) + 1;
    }
    advanceSim(sim, halfLen, opts.forcePossession);
  }
  return predicted;
}

export interface SimulatedPoint {
  /** 1-based point number in the whole game. */
  index: number;
  half: 1 | 2;
  possession: Possession;
  majority: MajorityGender;
  line: Line;
  lineup: Id[];
  /** A gender slot could not be filled from the fielded line. */
  short: boolean;
  /** Whole-game points each fielded player had played before this point. */
  playedBefore: Record<Id, number>;
}

/**
 * Play the rest of the game out point by point from the given state, trading
 * possession (O then D then O...) and fielding the line that matches possession.
 * Unlike predictGame, which returns per-player totals, this returns the ordered
 * sequence of points with each point's lineup and running counts.
 */
export function simulateGame(
  state: GameState,
  players: Player[],
  targets: Record<Id, number>,
): SimulatedPoint[] {
  const points: SimulatedPoint[] = [];
  const sim: GameState = {
    ...state,
    played: { ...state.played },
    playedThisHalf: { ...state.playedThisHalf },
    score: { ...state.score },
  };

  let guard = 0;
  const halfLen = Math.ceil(state.expectedPoints / 2);
  while (sim.totalPoints < state.expectedPoints && guard++ < 200) {
    const context: PointContext = {
      possession: sim.nextPossession,
      majority: sim.nextMajority,
      line: sim.nextPossession,
    };
    const { lineup, short } = selectLine(sim, players, context, targets);
    const playedBefore: Record<Id, number> = {};
    for (const entry of lineup) {
      playedBefore[entry.playerId] = sim.played[entry.playerId] ?? 0;
    }
    points.push({
      index: sim.totalPoints + 1,
      half: sim.half,
      possession: sim.nextPossession,
      majority: sim.nextMajority,
      line: context.line,
      lineup: lineup.map((l) => l.playerId),
      short,
      playedBefore,
    });
    for (const entry of lineup) {
      sim.played[entry.playerId] = (sim.played[entry.playerId] ?? 0) + 1;
      sim.playedThisHalf[entry.playerId] =
        (sim.playedThisHalf[entry.playerId] ?? 0) + 1;
    }
    advanceSim(sim, halfLen);
  }
  return points;
}

function advanceSim(
  sim: GameState,
  halfLen: number,
  forcePossession?: Possession,
): void {
  sim.totalPoints += 1;
  sim.pointsPlayedThisHalf += 1;
  if (sim.half === 1 && sim.pointsPlayedThisHalf >= halfLen) {
    sim.half = 2;
    sim.pointsPlayedThisHalf = 0;
    for (const id of Object.keys(sim.playedThisHalf)) sim.playedThisHalf[id] = 0;
    sim.nextPossession =
      forcePossession ?? (sim.startingPossession === 'O' ? 'D' : 'O');
  } else {
    // Points trade: possession alternates unless forced.
    sim.nextPossession =
      forcePossession ?? (sim.nextPossession === 'O' ? 'D' : 'O');
  }
  sim.nextMajority = majorityForPoint(
    sim.pointsPlayedThisHalf + 1,
    sim.startingMajority,
  );
}

function estimateHalfPointsLeft(state: GameState): number {
  const halfLen = Math.ceil(state.expectedPoints / 2);
  return Math.max(1, halfLen - state.pointsPlayedThisHalf);
}

function averageSlots(gender: Gender, expectedPoints: number): number {
  // Over the ABBA pattern points split ~evenly between M- and W-majority, so a
  // gender averages (4 + 3) / 2 = 3.5 slots per point.
  const mMajorityPoints = countMajority('M', expectedPoints);
  const wMajorityPoints = expectedPoints - mMajorityPoints;
  const mmp = (4 * mMajorityPoints + 3 * wMajorityPoints) / expectedPoints;
  return gender === 'MMP' ? mmp : 7 - mmp;
}

function countMajority(target: 'M' | 'W', points: number): number {
  let n = 0;
  for (let p = 1; p <= points; p++) if (majorityForPoint(p, 'M') === target) n++;
  return n;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
