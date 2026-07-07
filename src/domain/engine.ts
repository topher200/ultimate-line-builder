import { majorityForPoint, slotsForMajority } from './rules.ts';
import type {
  GameState,
  Gender,
  Id,
  LineupEntry,
  Mode,
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

/**
 * Per-player goal: how many points we want them to play this game. Computed
 * within each gender pool so goals stay achievable given the 4:3 / 3:4 ratio.
 * (O/D refinement is intentionally deferred; selection still enforces it.)
 */
export function computeTargets(
  players: Player[],
  expectedPoints: number,
  mode: Mode,
): Record<Id, number> {
  const active = players.filter((p) => p.active);
  const targets: Record<Id, number> = {};
  for (const gender of ['MMP', 'WMP'] as Gender[]) {
    const pool = active.filter((p) => p.gender === gender);
    const slotsPerPoint = averageSlots(gender, expectedPoints);
    const totalSlots = slotsPerPoint * expectedPoints;
    const weights = pool.map((p) => weightForMode(p.competitiveness, mode));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    pool.forEach((p, i) => {
      // A player can play at most every point.
      targets[p.id] = Math.min(
        expectedPoints,
        (totalSlots * weights[i]) / sum,
      );
    });
  }
  return targets;
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
 * Choose the line for the upcoming point: fill each gender's slots with the
 * eligible players furthest behind their target, honoring line preference and
 * the once-per-half rule.
 */
export function selectLine(
  state: GameState,
  players: Player[],
  context: PointContext,
  targets: Record<Id, number>,
): SelectionResult {
  const slots = slotsForMajority(context.majority);
  const active = players.filter((p) => p.active);
  const lineup: LineupEntry[] = [];
  const reasons: Record<Id, string> = {};
  let short = false;

  const halfPointsLeft = estimateHalfPointsLeft(state);
  const needingHalfPoint = active.filter(
    (p) => (state.playedThisHalf[p.id] ?? 0) === 0,
  ).length;

  for (const gender of ['MMP', 'WMP'] as Gender[]) {
    const need = gender === 'MMP' ? slots.MMP : slots.WMP;
    const pool = active.filter((p) => p.gender === gender);
    const ranked = rankCandidates(
      pool,
      context.possession,
      state,
      targets,
      needingHalfPoint,
      halfPointsLeft,
    );
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
  possession: Possession,
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
    // Competitive line preference: matching-line players sort ahead.
    const lineMatch = p.line === possession;
    const linePref = state.mode < 0.5 && lineMatch ? 1e6 : 0;
    const score = linePref + urgency + deficit;
    const reason = needsHalf
      ? 'needs a half point'
      : lineMatch
        ? 'owed a point'
        : 'cross-line fill';
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
