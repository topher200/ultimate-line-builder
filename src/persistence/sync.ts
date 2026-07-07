import { mergeLogs } from '../domain/merge.ts';
import type { EventEnvelope, Id } from '../domain/types.ts';
import { SupabaseRepository } from './supabaseRepository.ts';

/**
 * Reconcile one game between the local log and Supabase, returning the merged
 * log to persist locally. Pulls the remote log, longest-chain merges it with
 * local, and pushes any events the remote is missing. Safe to re-run: pushes
 * are idempotent on the event id.
 */
export async function syncGame(
  remote: SupabaseRepository,
  gameId: Id,
  localLog: EventEnvelope[],
): Promise<EventEnvelope[]> {
  const remoteLog = await remote.loadLog(gameId);
  const { merged } = mergeLogs(localLog, remoteLog);

  const remoteIds = new Set(remoteLog.map((e) => e.id));
  const toPush = merged.filter((e) => !remoteIds.has(e.id));
  await remote.appendEvents(toPush);

  return merged;
}
