import { useMemo } from 'react';
import { simulateGame, type SimulatedPoint } from '../domain/engine.ts';
import { playedPoints, type PlayedPoint } from '../domain/history.ts';
import { pointLabel } from '../domain/rules.ts';
import type { EventEnvelope, GameState, Id, Line, Player } from '../domain/types.ts';

/**
 * The whole game on one timeline: the points already played, a break, then the
 * lines we'd call for the rest of the game at the current mode.
 */
export function GameTimeline({
  events,
  players,
  game,
  targets,
}: {
  events: EventEnvelope[];
  players: Player[];
  game: GameState;
  targets: Record<Id, number>;
}) {
  const history = useMemo(() => playedPoints(events), [events]);
  const future = useMemo(
    () => simulateGame(game, players, targets),
    [game, players, targets],
  );
  const byId = (id: string) => players.find((p) => p.id === id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Played this game</h2>
        {history.length === 0 && (
          <p className="rounded-lg bg-slate-800 p-3 text-center text-slate-400">
            No points played yet.
          </p>
        )}
        {history.map((pt) => (
          <PlayedRow key={pt.eventId} pt={pt} byId={byId} />
        ))}
      </div>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-slate-600" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {future.length > 0 ? 'Rest of game (simulated)' : 'Game complete'}
        </span>
        <div className="h-px flex-1 bg-slate-600" />
      </div>

      <div className="flex flex-col gap-2">
        {future.map((pt) => (
          <SimRow key={pt.index} pt={pt} byId={byId} />
        ))}
      </div>
    </div>
  );
}

function RatioBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-200">
      {label}
    </span>
  );
}

function LineBadge({ line }: { line: Line }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-bold ${
        line === 'O'
          ? 'bg-emerald-800 text-emerald-200'
          : 'bg-indigo-800 text-indigo-200'
      }`}
    >
      {line} line
    </span>
  );
}

function PlayerPill({ player, count }: { player: Player; count?: number }) {
  return (
    <span
      className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
        player.gender === 'MMP' ? 'bg-sky-800' : 'bg-fuchsia-800'
      }`}
    >
      {player.name}
      {count !== undefined && (
        <span className="rounded bg-black/30 px-1.5 text-xs tabular-nums">
          {count}
        </span>
      )}
    </span>
  );
}

function PlayedRow({
  pt,
  byId,
}: {
  pt: PlayedPoint;
  byId: (id: string) => Player | undefined;
}) {
  const distinct = [...new Set(pt.lineup.map((l) => l.playerId))];
  const line = byId(distinct[0])?.line;
  return (
    <div className="rounded-lg bg-slate-800 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
        <span className="w-10 font-semibold text-slate-200">#{pt.index}</span>
        <RatioBadge label={pointLabel(pt.index, pt.majority)} />
        {line && <LineBadge line={line} />}
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            pt.scoredBy === 'us'
              ? 'bg-emerald-700 text-emerald-100'
              : 'bg-rose-800 text-rose-100'
          }`}
        >
          {pt.scoredBy === 'us' ? 'Us' : 'Them'}
        </span>
        <span className="tabular-nums">
          {pt.scoreAfter.us}-{pt.scoreAfter.them}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {distinct.map((id) => {
          const p = byId(id);
          return p ? <PlayerPill key={id} player={p} /> : null;
        })}
      </div>
    </div>
  );
}

function SimRow({
  pt,
  byId,
}: {
  pt: SimulatedPoint;
  byId: (id: string) => Player | undefined;
}) {
  return (
    <div className="rounded-lg bg-slate-800/60 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
        <span className="w-10 font-semibold text-slate-300">#{pt.index}</span>
        <RatioBadge label={pointLabel(pt.index, pt.majority)} />
        <LineBadge line={pt.line} />
        <span className="text-xs text-slate-500">H{pt.half}</span>
        {pt.short && (
          <span className="text-xs font-semibold text-amber-300">short a slot</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {pt.lineup.map((id) => {
          const p = byId(id);
          return p ? (
            <PlayerPill key={id} player={p} count={(pt.playedBefore[id] ?? 0) + 1} />
          ) : null;
        })}
      </div>
    </div>
  );
}
