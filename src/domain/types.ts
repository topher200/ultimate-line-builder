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
  | { kind: 'Undone'; targetId: Id };

export interface EventEnvelope {
  id: Id;
  gameId: Id;
  seq: number;
  parentId: Id | null;
  deviceId: DeviceId;
  ts: number;
  payload: EventPayload;
}

export interface Tournament {
  id: Id;
  name: string;
  createdAt: number;
  /** Last-write-wins clock; newer wins when merging edits across devices. */
  updatedAt?: number;
  /** Soft-delete tombstone; set means deleted. Syncs so deletes propagate. */
  deletedAt?: number;
}

export interface GameMeta {
  gameId: Id;
  name: string;
  createdAt: number;
  tournamentId: Id;
  /** Our team's display name; defaults to 'Rampage'. */
  ourTeam: string;
  /** Opponent's display name; defaults to 'Opponent'. */
  theirTeam: string;
  /** Last-write-wins clock; newer wins when merging edits across devices. */
  updatedAt?: number;
  /** Soft-delete tombstone; set means deleted. Syncs so deletes propagate. */
  deletedAt?: number;
}

/**
 * Snapshot of play at the moment the mode was last changed. Goals distribute the
 * points remaining after this baseline, so changing the mode re-plans from here
 * forward rather than rewriting the whole-game goal. Derived from the log
 * position of the latest ModeChanged (start of game if none).
 */
export interface ModeBaseline {
  totalPoints: number;
  played: Record<Id, number>;
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
  modeBaseline: ModeBaseline;
}

export interface PointContext {
  possession: Possession;
  majority: MajorityGender;
  /** Which line takes the field. Defaults to the line matching possession; the
   * coach can call the other line for a point. */
  line: Line;
}
