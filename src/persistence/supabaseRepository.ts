import type {
  EventEnvelope,
  GameMeta,
  Id,
  Roster,
  Tournament,
} from '../domain/types.ts';
import type { Repository } from './repository.ts';
import { getSupabase } from './supabaseClient.ts';
import { DEFAULT_OUR_TEAM, DEFAULT_THEIR_TEAM } from '../domain/defaults.ts';

const ROSTER_ID = 'team';

interface EventRow {
  id: string;
  game_id: string;
  seq: number;
  parent_id: string | null;
  device_id: string;
  ts: number;
  payload: EventEnvelope['payload'];
}

function toRow(e: EventEnvelope): EventRow {
  return {
    id: e.id,
    game_id: e.gameId,
    seq: e.seq,
    parent_id: e.parentId,
    device_id: e.deviceId,
    ts: e.ts,
    payload: e.payload,
  };
}

function fromRow(r: EventRow): EventEnvelope {
  return {
    id: r.id,
    gameId: r.game_id,
    seq: r.seq,
    parentId: r.parent_id,
    deviceId: r.device_id,
    ts: r.ts,
    payload: r.payload,
  };
}

/**
 * Supabase-backed persistence: a durable mirror of the local event log. Meant to
 * sit behind an offline buffer (LocalRepository) with reconciliation via
 * mergeLogs; see src/persistence/sync.ts. Requires the schema in db/schema.sql.
 */
export class SupabaseRepository implements Repository {
  async loadRoster(): Promise<Roster | null> {
    const { data, error } = await getSupabase()
      .from('rosters')
      .select('doc')
      .eq('id', ROSTER_ID)
      .maybeSingle();
    if (error) throw error;
    return (data?.doc as Roster) ?? null;
  }

  async saveRoster(roster: Roster): Promise<void> {
    const { error } = await getSupabase()
      .from('rosters')
      .upsert({ id: ROSTER_ID, doc: roster, updated_at: roster.updatedAt });
    if (error) throw error;
  }

  async listTournaments(): Promise<Tournament[]> {
    const { data, error } = await getSupabase()
      .from('tournaments')
      .select('id, name, created_at, updated_at, deleted_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      ...(t.updated_at ? { updatedAt: t.updated_at } : {}),
      ...(t.deleted_at ? { deletedAt: t.deleted_at } : {}),
    }));
  }

  async saveTournaments(tournaments: Tournament[]): Promise<void> {
    if (tournaments.length === 0) return;
    const { error } = await getSupabase().from('tournaments').upsert(
      tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        created_at: t.createdAt,
        updated_at: t.updatedAt ?? null,
        deleted_at: t.deletedAt ?? null,
      })),
    );
    if (error) throw error;
  }

  async listGames(): Promise<GameMeta[]> {
    const { data, error } = await getSupabase()
      .from('games')
      .select(
        'game_id, name, created_at, tournament_id, our_team, their_team, updated_at, deleted_at',
      )
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((g) => ({
      gameId: g.game_id,
      name: g.name,
      createdAt: g.created_at,
      tournamentId: g.tournament_id,
      ourTeam: g.our_team ?? DEFAULT_OUR_TEAM,
      theirTeam: g.their_team ?? DEFAULT_THEIR_TEAM,
      ...(g.updated_at ? { updatedAt: g.updated_at } : {}),
      ...(g.deleted_at ? { deletedAt: g.deleted_at } : {}),
    }));
  }

  async saveGames(games: GameMeta[]): Promise<void> {
    if (games.length === 0) return;
    const { error } = await getSupabase().from('games').upsert(
      games.map((g) => ({
        game_id: g.gameId,
        name: g.name,
        created_at: g.createdAt,
        tournament_id: g.tournamentId,
        our_team: g.ourTeam,
        their_team: g.theirTeam,
        updated_at: g.updatedAt ?? null,
        deleted_at: g.deletedAt ?? null,
      })),
    );
    if (error) throw error;
  }

  async loadLog(gameId: Id): Promise<EventEnvelope[]> {
    const { data, error } = await getSupabase()
      .from('events')
      .select('*')
      .eq('game_id', gameId)
      .order('seq', { ascending: true });
    if (error) throw error;
    return (data as EventRow[] | null)?.map(fromRow) ?? [];
  }

  async saveLog(_gameId: Id, events: EventEnvelope[]): Promise<void> {
    // Events are immutable and id-keyed, so persisting a log is an idempotent
    // upsert of its events.
    await this.appendEvents(events);
  }

  async appendEvent(event: EventEnvelope): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    // Idempotent: re-pushing an already-synced event is a no-op on the id key.
    const { error } = await getSupabase()
      .from('events')
      .upsert(events.map(toRow), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
}
