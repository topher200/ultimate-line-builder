import { create } from 'zustand';
import { deriveState } from '../domain/fold.ts';
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
import {
  getCurrentTournamentId,
  getDeviceId,
  newId,
  rollNewTournamentId,
} from '../lib/ids.ts';
import { LocalRepository, type Repository } from '../persistence/repository.ts';
import { isSupabaseConfigured } from '../persistence/supabaseClient.ts';
import { SupabaseRepository } from '../persistence/supabaseRepository.ts';
import { syncGame } from '../persistence/sync.ts';

// Cloud mirror, only when the publishable key is configured. Writes are pushed
// best-effort (local stays the source of truth); errors never break the app.
const remote = isSupabaseConfigured ? new SupabaseRepository() : null;

function pushRemote(op: () => Promise<unknown>): void {
  if (!remote) return;
  void op().catch((e) => console.warn('[sync] push failed', e));
}

interface AppState {
  repo: Repository;
  deviceId: string;
  currentTournamentId: Id;
  ready: boolean;
  players: Player[];
  games: GameMeta[];
  currentGameId: Id | null;
  /** Every game's log, kept in memory for cross-game aggregates. */
  logs: Record<Id, EventEnvelope[]>;
  /** Convenience mirror of logs[currentGameId]. */
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
  loadGame: (gameId: Id) => void;
  startNewTournament: () => void;
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
  currentTournamentId: getCurrentTournamentId(),
  ready: false,
  players: [],
  games: [],
  currentGameId: null,
  logs: {},
  events: [],

  init: async () => {
    const { repo } = get();
    const roster = await repo.loadRoster();
    const games = await repo.listGames();
    const logs: Record<Id, EventEnvelope[]> = {};
    for (const g of games) logs[g.gameId] = await repo.loadLog(g.gameId);
    const currentGameId = games.at(-1)?.gameId ?? null;
    set({
      players: roster?.players ?? [],
      games,
      logs,
      currentGameId,
      events: currentGameId ? (logs[currentGameId] ?? []) : [],
      ready: true,
    });
    void reconcileRemote(get, set);
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
    const meta: GameMeta = {
      gameId,
      name: opts.name,
      createdAt: Date.now(),
      tournamentId: get().currentTournamentId,
    };
    const games = [...get().games, meta];
    void get().repo.saveGames(games);
    pushRemote(() => remote!.saveGames(games));
    set({
      games,
      currentGameId: gameId,
      logs: { ...get().logs, [gameId]: [] },
      events: [],
    });
    appendEvent(get, set, {
      kind: 'GameStarted',
      startingPossession: opts.startingPossession,
      startingMajority: opts.startingMajority,
      expectedPoints: opts.expectedPoints,
      mode: opts.mode,
    });
  },

  loadGame: (gameId) => {
    set({ currentGameId: gameId, events: get().logs[gameId] ?? [] });
  },

  startNewTournament: () => {
    set({ currentTournamentId: rollNewTournamentId() });
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
  pushRemote(() => remote!.saveRoster(roster));
}

function appendEvent(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  payload: EventPayload,
): void {
  const { events, currentGameId, deviceId, repo, logs } = get();
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
  const next = [...events, envelope];
  set({ events: next, logs: { ...logs, [currentGameId]: next } });
  void repo.appendEvent(envelope);
  pushRemote(() => remote!.appendEvent(envelope));
}

/**
 * Best-effort pull from Supabase on startup: union the game list, longest-chain
 * merge each log, adopt the remote roster if we have none locally, and persist
 * the results. Runs only when configured; failures are logged, not surfaced.
 */
async function reconcileRemote(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  if (!remote) return;
  try {
    const [remoteRoster, remoteGames] = await Promise.all([
      remote.loadRoster(),
      remote.listGames(),
    ]);

    const byId = new Map<Id, GameMeta>();
    for (const g of remoteGames) byId.set(g.gameId, g);
    for (const g of get().games) byId.set(g.gameId, g);
    const games = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);

    const logs = { ...get().logs };
    for (const g of games) {
      logs[g.gameId] = await syncGame(remote, g.gameId, logs[g.gameId] ?? []);
      await get().repo.saveLog(g.gameId, logs[g.gameId]);
    }
    await get().repo.saveGames(games);

    let players = get().players;
    if (players.length === 0 && remoteRoster) {
      players = remoteRoster.players;
      await get().repo.saveRoster(remoteRoster);
    }

    const currentGameId = get().currentGameId ?? games.at(-1)?.gameId ?? null;
    set({
      players,
      games,
      logs,
      currentGameId,
      events: currentGameId ? (logs[currentGameId] ?? []) : [],
    });
  } catch (e) {
    console.warn('[sync] reconcile failed', e);
  }
}
