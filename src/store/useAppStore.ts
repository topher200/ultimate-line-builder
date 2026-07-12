import { create } from 'zustand';
import { deriveState } from '../domain/fold.ts';
import { DEFAULT_OUR_TEAM, DEFAULT_THEIR_TEAM } from '../domain/defaults.ts';
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
  Tournament,
} from '../domain/types.ts';
import {
  getCurrentTournamentId,
  getDeviceId,
  newId,
  setCurrentTournamentId,
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

// Reconcile with the cloud mirror on reconnect and on foreground, catching up
// any events whose push failed while offline. Re-pushing is idempotent (events
// upsert by id), so a full re-sync is a safe catch-up.
let syncTriggersAttached = false;
function attachSyncTriggers(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): void {
  if (syncTriggersAttached || !remote || typeof window === 'undefined') return;
  syncTriggersAttached = true;
  window.addEventListener('online', () => void reconcileRemote(get, set));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reconcileRemote(get, set);
  });
}

interface AppState {
  repo: Repository;
  deviceId: string;
  currentTournamentId: Id;
  ready: boolean;
  players: Player[];
  /** Last-write-wins clock for the roster document; drives cross-device merge. */
  rosterUpdatedAt: number;
  tournaments: Tournament[];
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
    ourTeam: string;
    theirTeam: string;
    startingPossession: Possession;
    startingMajority: MajorityGender;
    expectedPoints: number;
    mode: Mode;
  }) => void;
  loadGame: (gameId: Id) => void;
  updateGameMeta: (gameId: Id, patch: Partial<Pick<GameMeta, 'name' | 'ourTeam' | 'theirTeam'>>) => void;
  createTournament: (name: string) => Id;
  renameTournament: (id: Id, name: string) => void;
  deleteTournament: (id: Id) => void;
  setCurrentTournament: (id: Id) => void;
  recordPoint: (lineup: LineupEntry[], scoredBy: 'us' | 'them') => void;
  undoLast: () => void;
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
  rosterUpdatedAt: 0,
  tournaments: [],
  games: [],
  currentGameId: null,
  logs: {},
  events: [],

  init: async () => {
    const { repo } = get();
    const roster = await repo.loadRoster();
    const games = (await repo.listGames()).map(withTeamDefaults);
    const logs: Record<Id, EventEnvelope[]> = {};
    for (const g of games) logs[g.gameId] = await repo.loadLog(g.gameId);
    const currentGameId = lastLiveGameId(games);

    const loaded = await repo.listTournaments();
    const { tournaments, changed } = backfillTournaments(
      loaded,
      games,
      get().currentTournamentId,
    );
    if (changed) {
      await repo.saveTournaments(tournaments);
      pushRemote(() => remote!.saveTournaments(tournaments));
    }

    set({
      players: roster?.players ?? [],
      rosterUpdatedAt: roster?.updatedAt ?? 0,
      tournaments,
      games,
      logs,
      currentGameId,
      events: currentGameId ? (logs[currentGameId] ?? []) : [],
      ready: true,
    });
    void reconcileRemote(get, set);
    attachSyncTriggers(get, set);
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
      updatedAt: Date.now(),
      tournamentId: get().currentTournamentId,
      ourTeam: opts.ourTeam,
      theirTeam: opts.theirTeam,
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

  updateGameMeta: (gameId, patch) => {
    const games = get().games.map((g) =>
      g.gameId === gameId ? { ...g, ...patch, updatedAt: Date.now() } : g,
    );
    set({ games });
    void get().repo.saveGames(games);
    pushRemote(() => remote!.saveGames(games));
  },

  createTournament: (name) => {
    const t: Tournament = {
      id: newId(),
      name: name.trim() || new Date().toLocaleDateString(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const tournaments = [...get().tournaments, t];
    set({ tournaments, currentTournamentId: t.id });
    setCurrentTournamentId(t.id);
    void get().repo.saveTournaments(tournaments);
    pushRemote(() => remote!.saveTournaments(tournaments));
    return t.id;
  },

  renameTournament: (id, name) => {
    const tournaments = get().tournaments.map((t) =>
      t.id === id ? { ...t, name, updatedAt: Date.now() } : t,
    );
    set({ tournaments });
    void get().repo.saveTournaments(tournaments);
    pushRemote(() => remote!.saveTournaments(tournaments));
  },

  deleteTournament: (id) => {
    const { tournaments, games, logs, currentGameId, currentTournamentId, repo } =
      get();
    // Soft-delete: tombstone the tournament and its games so the deletion syncs
    // (the add-only merge would otherwise resurrect them on other devices).
    const deletedAt = Date.now();
    const nextTournaments = tournaments.map((t) =>
      t.id === id ? { ...t, deletedAt, updatedAt: deletedAt } : t,
    );
    const nextGames = games.map((g) =>
      g.tournamentId === id && !g.deletedAt
        ? { ...g, deletedAt, updatedAt: deletedAt }
        : g,
    );
    const currentDeleted = nextGames.some(
      (g) => g.gameId === currentGameId && g.deletedAt,
    );
    const nextGameId = currentDeleted ? null : currentGameId;

    set({
      tournaments: nextTournaments,
      games: nextGames,
      currentGameId: nextGameId,
      events: nextGameId ? (logs[nextGameId] ?? []) : [],
    });

    void repo.saveTournaments(nextTournaments);
    void repo.saveGames(nextGames);
    pushRemote(() => remote!.saveTournaments(nextTournaments));
    pushRemote(() => remote!.saveGames(nextGames));

    // Keep a valid current tournament: fall back to the newest survivor, or a
    // fresh one when the last tournament is deleted.
    if (currentTournamentId === id) {
      const next = nextTournaments
        .filter((t) => !t.deletedAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (next) get().setCurrentTournament(next.id);
      else get().createTournament('');
    }
  },

  setCurrentTournament: (id) => {
    set({ currentTournamentId: id });
    setCurrentTournamentId(id);
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

  undoLast: () => {
    const events = get().events;
    const undone = new Set<string>();
    for (const e of events) {
      if (e.payload.kind === 'Undone') undone.add(e.payload.targetId);
    }
    // Step back through the last completed point or half start not already undone.
    const last = [...events]
      .reverse()
      .find(
        (e) =>
          (e.payload.kind === 'PointCompleted' || e.payload.kind === 'HalfStarted') &&
          !undone.has(e.id),
      );
    if (last) appendEvent(get, set, { kind: 'Undone', targetId: last.id });
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

/** Backfill team names on games persisted before those fields existed. */
function withTeamDefaults(meta: GameMeta): GameMeta {
  return {
    ...meta,
    ourTeam: meta.ourTeam || DEFAULT_OUR_TEAM,
    theirTeam: meta.theirTeam || DEFAULT_THEIR_TEAM,
  };
}

/** Most recently listed game that hasn't been soft-deleted. */
function lastLiveGameId(games: GameMeta[]): Id | null {
  for (let i = games.length - 1; i >= 0; i--) {
    if (!games[i].deletedAt) return games[i].gameId;
  }
  return null;
}

/**
 * Merge remote and local rows by id. Field values follow last-write-wins on
 * `updatedAt` (local wins ties, since the live tablet is the source of truth),
 * and a soft-delete tombstone is sticky: a delete from either side survives a
 * later edit on the other, so deletions can't be resurrected by the add-only
 * merge.
 */
function mergeRows<T extends { updatedAt?: number; deletedAt?: number }>(
  remote: T[],
  local: T[],
  key: (row: T) => Id,
): T[] {
  const byId = new Map<Id, T>();
  const consider = (row: T) => {
    const prev = byId.get(key(row));
    const winner =
      !prev || (row.updatedAt ?? 0) >= (prev.updatedAt ?? 0) ? row : prev;
    const deletedAt = prev?.deletedAt ?? row.deletedAt;
    byId.set(key(row), deletedAt ? { ...winner, deletedAt } : winner);
  };
  for (const row of remote) consider(row);
  for (const row of local) consider(row);
  return [...byId.values()];
}

/**
 * Synthesize a tournament record for any tournamentId referenced by a game (or
 * the current pointer) that has none, so every game groups under a named
 * tournament. Names default to the earliest game date in the group.
 */
function backfillTournaments(
  tournaments: Tournament[],
  games: GameMeta[],
  currentTournamentId: Id,
): { tournaments: Tournament[]; changed: boolean } {
  const known = new Set(tournaments.map((t) => t.id));
  const earliest = new Map<Id, number>();
  for (const g of games) {
    if (g.deletedAt || known.has(g.tournamentId)) continue;
    const at = earliest.get(g.tournamentId);
    if (at === undefined || g.createdAt < at) earliest.set(g.tournamentId, g.createdAt);
  }
  if (!known.has(currentTournamentId) && !earliest.has(currentTournamentId)) {
    earliest.set(currentTournamentId, Date.now());
  }
  if (earliest.size === 0) return { tournaments, changed: false };

  const added: Tournament[] = [...earliest].map(([id, createdAt]) => ({
    id,
    name: new Date(createdAt).toLocaleDateString(),
    createdAt,
  }));
  const merged = [...tournaments, ...added].sort((a, b) => a.createdAt - b.createdAt);
  return { tournaments: merged, changed: true };
}

function persistRoster(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  players: Player[],
): void {
  const roster: Roster = {
    players,
    updatedAt: Date.now(),
    updatedBy: get().deviceId,
  };
  set({ players, rosterUpdatedAt: roster.updatedAt });
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
let reconcileInFlight = false;
async function reconcileRemote(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  if (!remote || reconcileInFlight) return;
  reconcileInFlight = true;
  try {
    const [remoteRoster, remoteTournaments, remoteGames] = await Promise.all([
      remote.loadRoster(),
      remote.listTournaments(),
      remote.listGames(),
    ]);

    const tournaments = mergeRows(remoteTournaments, get().tournaments, (t) => t.id).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    await get().repo.saveTournaments(tournaments);

    const games = mergeRows(
      remoteGames.map(withTeamDefaults),
      get().games,
      (g) => g.gameId,
    ).sort((a, b) => a.createdAt - b.createdAt);

    const logs = { ...get().logs };
    for (const g of games) {
      if (g.deletedAt) continue;
      logs[g.gameId] = await syncGame(remote, g.gameId, logs[g.gameId] ?? []);
      await get().repo.saveLog(g.gameId, logs[g.gameId]);
    }
    await get().repo.saveGames(games);

    // Roster is a single document; adopt whichever side's is newer
    // (last-write-wins), and re-push a newer local one to catch up failed
    // offline writes.
    let players = get().players;
    let rosterUpdatedAt = get().rosterUpdatedAt;
    if (remoteRoster && remoteRoster.updatedAt > rosterUpdatedAt) {
      players = remoteRoster.players;
      rosterUpdatedAt = remoteRoster.updatedAt;
      await get().repo.saveRoster(remoteRoster);
    } else if (rosterUpdatedAt > (remoteRoster?.updatedAt ?? 0)) {
      pushRemote(() =>
        remote!.saveRoster({ players, updatedAt: rosterUpdatedAt, updatedBy: get().deviceId }),
      );
    }

    const prevId = get().currentGameId;
    const stillLive = games.some((g) => g.gameId === prevId && !g.deletedAt);
    const currentGameId = stillLive ? prevId : lastLiveGameId(games);

    // Another device may have tombstoned the tournament this device had
    // selected; re-point at the newest live one so new games don't land in a
    // deleted (and thus invisible) tournament.
    let currentTournamentId = get().currentTournamentId;
    const liveTournaments = tournaments.filter((t) => !t.deletedAt);
    if (!liveTournaments.some((t) => t.id === currentTournamentId)) {
      const newest = [...liveTournaments].sort((a, b) => b.createdAt - a.createdAt)[0];
      if (newest) {
        currentTournamentId = newest.id;
        setCurrentTournamentId(currentTournamentId);
      }
    }

    set({
      players,
      rosterUpdatedAt,
      tournaments,
      games,
      currentTournamentId,
      logs,
      currentGameId,
      events: currentGameId ? (logs[currentGameId] ?? []) : [],
    });
  } catch (e) {
    console.warn('[sync] reconcile failed', e);
  } finally {
    reconcileInFlight = false;
  }
}
