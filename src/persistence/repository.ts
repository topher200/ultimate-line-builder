import type {
  EventEnvelope,
  GameMeta,
  Id,
  Roster,
  Tournament,
} from '../domain/types.ts';

export interface Repository {
  loadRoster(): Promise<Roster | null>;
  saveRoster(roster: Roster): Promise<void>;
  listTournaments(): Promise<Tournament[]>;
  saveTournaments(tournaments: Tournament[]): Promise<void>;
  listGames(): Promise<GameMeta[]>;
  saveGames(games: GameMeta[]): Promise<void>;
  deleteTournament(id: Id): Promise<void>;
  deleteGames(gameIds: Id[]): Promise<void>;
  loadLog(gameId: Id): Promise<EventEnvelope[]>;
  saveLog(gameId: Id, events: EventEnvelope[]): Promise<void>;
  appendEvent(event: EventEnvelope): Promise<void>;
}

const KEY = {
  roster: 'ulb:roster',
  tournaments: 'ulb:tournaments',
  games: 'ulb:games',
  log: (gameId: Id) => `ulb:log:${gameId}`,
};

/** Rev-1 persistence: JSON in localStorage. A weekend is a few hundred events. */
export class LocalRepository implements Repository {
  async loadRoster(): Promise<Roster | null> {
    return readJson<Roster>(KEY.roster);
  }

  async saveRoster(roster: Roster): Promise<void> {
    writeJson(KEY.roster, roster);
  }

  async listTournaments(): Promise<Tournament[]> {
    return readJson<Tournament[]>(KEY.tournaments) ?? [];
  }

  async saveTournaments(tournaments: Tournament[]): Promise<void> {
    writeJson(KEY.tournaments, tournaments);
  }

  async listGames(): Promise<GameMeta[]> {
    return readJson<GameMeta[]>(KEY.games) ?? [];
  }

  async saveGames(games: GameMeta[]): Promise<void> {
    writeJson(KEY.games, games);
  }

  async deleteTournament(id: Id): Promise<void> {
    const tournaments = await this.listTournaments();
    await this.saveTournaments(tournaments.filter((t) => t.id !== id));
  }

  async deleteGames(gameIds: Id[]): Promise<void> {
    const removed = new Set(gameIds);
    const games = await this.listGames();
    await this.saveGames(games.filter((g) => !removed.has(g.gameId)));
    for (const id of gameIds) localStorage.removeItem(KEY.log(id));
  }

  async loadLog(gameId: Id): Promise<EventEnvelope[]> {
    return readJson<EventEnvelope[]>(KEY.log(gameId)) ?? [];
  }

  async saveLog(gameId: Id, events: EventEnvelope[]): Promise<void> {
    writeJson(KEY.log(gameId), events);
  }

  async appendEvent(event: EventEnvelope): Promise<void> {
    const log = await this.loadLog(event.gameId);
    log.push(event);
    writeJson(KEY.log(event.gameId), log);
  }
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
