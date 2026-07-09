import { DEFAULT_EXPECTED_POINTS } from './defaults.ts';
import { majorityForPoint, possessionForPoint } from './rules.ts';
import type {
  EventEnvelope,
  GameState,
  MajorityGender,
  Possession,
} from './types.ts';

const DEFAULTS = {
  expectedPoints: DEFAULT_EXPECTED_POINTS,
  mode: 0,
  startingPossession: 'O' as Possession,
  startingMajority: 'M' as MajorityGender,
};

/**
 * Fold an event log into the current game state. Undone points are skipped, so
 * score, counts, and the next-point context recompute as if they never
 * happened. Overrides apply only to the point about to be played.
 */
export function deriveState(events: EventEnvelope[]): GameState {
  const undone = new Set<string>();
  for (const e of events) {
    if (e.payload.kind === 'Undone') undone.add(e.payload.targetId);
  }

  let expectedPoints = DEFAULTS.expectedPoints;
  let mode = DEFAULTS.mode;
  let startingPossession = DEFAULTS.startingPossession;
  let startingMajority = DEFAULTS.startingMajority;
  let half: 1 | 2 = 1;
  let totalPoints = 0;
  let pointsPlayedThisHalf = 0;
  let lastScoredBy: 'us' | 'them' | null = null;
  const score = { us: 0, them: 0 };
  const played: Record<string, number> = {};
  const playedThisHalf: Record<string, number> = {};
  let pendingPossession: Possession | null = null;
  let pendingMajority: MajorityGender | null = null;
  let baselineTotalPoints = 0;
  let baselinePlayed: Record<string, number> = {};

  for (const e of events) {
    const p = e.payload;
    switch (p.kind) {
      case 'GameStarted':
        expectedPoints = p.expectedPoints;
        mode = p.mode;
        startingPossession = p.startingPossession;
        startingMajority = p.startingMajority;
        break;
      case 'ExpectedPointsChanged':
        expectedPoints = p.value;
        break;
      case 'ModeChanged':
        mode = p.value;
        // Re-plan the remaining points from here: pin the baseline to now.
        baselineTotalPoints = totalPoints;
        baselinePlayed = { ...played };
        break;
      case 'PossessionOverridden':
        pendingPossession = p.value;
        break;
      case 'MajorityOverridden':
        pendingMajority = p.value;
        break;
      case 'HalfStarted':
        if (undone.has(e.id)) break;
        half = 2;
        pointsPlayedThisHalf = 0;
        lastScoredBy = null;
        for (const id of Object.keys(playedThisHalf)) playedThisHalf[id] = 0;
        break;
      case 'PointCompleted': {
        if (undone.has(e.id)) break;
        for (const id of distinctPlayerIds(p.lineup)) {
          played[id] = (played[id] ?? 0) + 1;
          playedThisHalf[id] = (playedThisHalf[id] ?? 0) + 1;
        }
        if (p.scoredBy === 'us') score.us += 1;
        else score.them += 1;
        lastScoredBy = p.scoredBy;
        totalPoints += 1;
        pointsPlayedThisHalf += 1;
        pendingPossession = null;
        pendingMajority = null;
        break;
      }
      case 'Undone':
        break;
    }
  }

  const isFirstOfGame = totalPoints === 0;
  const isFirstOfHalf2 = half === 2 && pointsPlayedThisHalf === 0;
  const basePossession = possessionForPoint({
    isFirstOfGame,
    isFirstOfHalf2,
    startingPossession,
    lastScoredBy,
  });
  const baseMajority = majorityForPoint(totalPoints + 1, startingMajority);

  return {
    expectedPoints,
    mode,
    startingPossession,
    startingMajority,
    half,
    totalPoints,
    score,
    played,
    playedThisHalf,
    pointsPlayedThisHalf,
    nextPossession: pendingPossession ?? basePossession,
    nextMajority: pendingMajority ?? baseMajority,
    modeBaseline: { totalPoints: baselineTotalPoints, played: baselinePlayed },
  };
}

function distinctPlayerIds(lineup: { playerId: string }[]): string[] {
  return [...new Set(lineup.map((l) => l.playerId))];
}

/** A brand-new game's state from config, for what-if simulation (Predictor). */
export function freshGameState(config: {
  startingPossession: Possession;
  startingMajority: MajorityGender;
  expectedPoints: number;
  mode: number;
}): GameState {
  return deriveState([
    {
      id: 'seed',
      gameId: 'sim',
      seq: 0,
      parentId: null,
      deviceId: 'sim',
      ts: 0,
      payload: { kind: 'GameStarted', ...config },
    },
  ]);
}
