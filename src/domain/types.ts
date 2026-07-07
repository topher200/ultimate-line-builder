export type Id = string;
export type DeviceId = string;

export type Gender = 'MMP' | 'WMP';
export type Line = 'O' | 'D';
export type Possession = 'O' | 'D';
export type MajorityGender = 'M' | 'W';

export interface Player {
  id: Id;
  name: string;
  gender: Gender;
  line: Line;
  /** 0..1, sensitive: head-coach only, never shown on the Game screen. */
  competitiveness: number;
  active: boolean;
}

export interface Roster {
  players: Player[];
  updatedAt: number;
  updatedBy: DeviceId;
}

/** 0 = fully competitive, 0.5 = equal, 1 = non-competitive. */
export type Mode = number;

export interface LineupEntry {
  playerId: Id;
  /** Set when this player came on for an injured teammate; both are credited. */
  injurySubFor?: Id;
}

export type EventPayload =
  | {
      kind: 'GameStarted';
      startingPossession: Possession;
      startingMajority: MajorityGender;
      expectedPoints: number;
      mode: Mode;
    }
  | {
      kind: 'PointCompleted';
      lineup: LineupEntry[];
      possession: Possession;
      majority: MajorityGender;
      scoredBy: 'us' | 'them';
    }
  | { kind: 'ExpectedPointsChanged'; value: number }
  | { kind: 'ModeChanged'; value: Mode }
  | { kind: 'PossessionOverridden'; value: Possession }
  | { kind: 'MajorityOverridden'; value: MajorityGender }
  | { kind: 'HalfStarted' }
  | { kind: 'PointUndone'; targetId: Id };

export interface EventEnvelope {
  id: Id;
  gameId: Id;
  seq: number;
  parentId: Id | null;
  deviceId: DeviceId;
  ts: number;
  payload: EventPayload;
}

export interface GameMeta {
  gameId: Id;
  name: string;
  createdAt: number;
  tournamentId: Id;
}

/** Everything on-screen derives from folding the event log into this. */
export interface GameState {
  expectedPoints: number;
  mode: Mode;
  startingPossession: Possession;
  startingMajority: MajorityGender;
  half: 1 | 2;
  /** Completed (non-undone) points, whole game. */
  totalPoints: number;
  score: { us: number; them: number };
  /** Points played per player, whole game. */
  played: Record<Id, number>;
  /** Points played per player, current half (drives the once-per-half rule). */
  playedThisHalf: Record<Id, number>;
  /** Context for the point about to be played, after any pending overrides. */
  nextPossession: Possession;
  nextMajority: MajorityGender;
  pointsPlayedThisHalf: number;
}

export interface PointContext {
  possession: Possession;
  majority: MajorityGender;
}
