import { create } from 'zustand';
import { deriveState } from '../domain/fold.ts';
import { computeTargets, predictGame } from '../domain/engine.ts';
import type {
  EventEnvelope,
  EventPayload,
  GameMeta,
  Id,
  LineupEntry,
  MajorityGender,
  Mode,
  Player,
  Possession,
  Roster,
} from '../domain/types.ts';
import { getDeviceId, newId } from '../lib/ids.ts';
import { LocalRepository, type Repository } from '../persistence/repository.ts';

interface AppState {
  repo: Repository;
  deviceId: string;
  ready: boolean;
  players: Player[];
  games: GameMeta[];
  currentGameId: Id | null;
  events: EventEnvelope[];

  init: () => Promise<void>;

  // roster
  addPlayer: (p: Omit<Player, 'id'>) => void;
  updatePlayer: (id: Id, patch: Partial<Player>) => void;
  removePlayer: (id: Id) => void;

  // game
  newGame: (opts: {
    name: string;
    startingPossession: Possession;
    startingMajority: MajorityGender;
    expectedPoints: number;
    mode: Mode;
  }) => void;
  loadGame: (gameId: Id) => Promise<void>;
  recordPoint: (lineup: LineupEntry[], scoredBy: 'us' | 'them') => void;
  undoLastPoint: () => void;
  startSecondHalf: () => void;
  setMode: (value: Mode) => void;
  setExpectedPoints: (value: number) => void;
  overridePossession: (value: Possession) => void;
  overrideMajority: (value: MajorityGender) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  repo: new LocalRepository(),
  deviceId: getDeviceId(),
  ready: false,
  players: [],
  games: [],
  currentGameId: null,
  events: [],

  init: async () => {
    const { repo } = get();
    const roster = await repo.loadRoster();
    const games = await repo.listGames();
    const currentGameId = games.at(-1)?.gameId ?? null;
    const events = currentGameId ? await repo.loadLog(currentGameId) : [];
    set({ players: roster?.players ?? [], games, currentGameId, events, ready: true });
  },

  addPlayer: (p) => {
    const player: Player = { ...p, id: newId() };
    persistRoster(get, set, [...get().players, player]);
  },

  updatePlayer: (id, patch) => {
    persistRoster(
      get,
      set,
      get().players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  },

  removePlayer: (id) => {
    persistRoster(
      get,
      set,
      get().players.filter((p) => p.id !== id),
    );
  },

  newGame: (opts) => {
    const gameId = newId();
    const meta: GameMeta = { gameId, name: opts.name, createdAt: Date.now() };
    const games = [...get().games, meta];
    void get().repo.saveGames(games);
    set({ games, currentGameId: gameId, events: [] });
    appendEvent(get, set, {
      kind: 'GameStarted',
      startingPossession: opts.startingPossession,
      startingMajority: opts.startingMajority,
      expectedPoints: opts.expectedPoints,
      mode: opts.mode,
    });
  },

  loadGame: async (gameId) => {
    const events = await get().repo.loadLog(gameId);
    set({ currentGameId: gameId, events });
  },

  recordPoint: (lineup, scoredBy) => {
    const s = deriveState(get().events);
    appendEvent(get, set, {
      kind: 'PointCompleted',
      lineup,
      possession: s.nextPossession,
      majority: s.nextMajority,
      scoredBy,
    });
  },

  undoLastPoint: () => {
    const last = [...get().events]
      .reverse()
      .find((e) => e.payload.kind === 'PointCompleted');
    if (last) appendEvent(get, set, { kind: 'PointUndone', targetId: last.id });
  },

  startSecondHalf: () => appendEvent(get, set, { kind: 'HalfStarted' }),
  setMode: (value) => appendEvent(get, set, { kind: 'ModeChanged', value }),
  setExpectedPoints: (value) =>
    appendEvent(get, set, { kind: 'ExpectedPointsChanged', value }),
  overridePossession: (value) =>
    appendEvent(get, set, { kind: 'PossessionOverridden', value }),
  overrideMajority: (value) =>
    appendEvent(get, set, { kind: 'MajorityOverridden', value }),
}));

function persistRoster(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  players: Player[],
): void {
  set({ players });
  const roster: Roster = {
    players,
    updatedAt: Date.now(),
    updatedBy: get().deviceId,
  };
  void get().repo.saveRoster(roster);
}

function appendEvent(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  payload: EventPayload,
): void {
  const { events, currentGameId, deviceId, repo } = get();
  if (!currentGameId) return;
  const envelope: EventEnvelope = {
    id: newId(),
    gameId: currentGameId,
    seq: events.length,
    parentId: events.at(-1)?.id ?? null,
    deviceId,
    ts: Date.now(),
    payload,
  };
  set({ events: [...events, envelope] });
  void repo.appendEvent(envelope);
}

/** Derived view for components: folded state plus goals and predictions. */
export function selectDerived(s: AppState) {
  const game = deriveState(s.events);
  const targets = computeTargets(s.players, game.expectedPoints, game.mode);
  const predicted = predictGame(game, s.players, targets);
  return { game, targets, predicted };
}
