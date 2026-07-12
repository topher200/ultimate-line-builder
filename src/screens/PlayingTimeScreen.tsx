import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { computeTargets, predictGame } from '../domain/engine.ts';
import { sameDay, sumPlayedAcross } from '../domain/aggregate.ts';
import { ViewFilterBar } from '../components/ViewFilterBar.tsx';
import {
  matchesView,
  type GenderView,
  type LineView,
} from '../components/viewFilter.ts';
import { GameSettings } from '../components/GameSettings.tsx';

export function PlayingTimeScreen() {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);
  const games = useAppStore((s) => s.games);
  const tournaments = useAppStore((s) => s.tournaments);
  const logs = useAppStore((s) => s.logs);
  const currentGameId = useAppStore((s) => s.currentGameId);
  const meta = games.find((g) => g.gameId === currentGameId);
  const tournament = tournaments.find((t) => t.id === meta?.tournamentId);

  const [genderView, setGenderView] = useState<GenderView>('ALL');
  const [lineView, setLineView] = useState<LineView>('ALL');

  const { game, targets, predicted } = useMemo(() => {
    const g = deriveState(events);
    const t = computeTargets(players, g.expectedPoints, g.mode, 0.5, g.modeBaseline);
    return { game: g, targets: t, predicted: predictGame(g, players, t) };
  }, [events, players]);

  const { dayPlayed, tournamentPlayed } = useMemo(() => {
    const current = games.find((m) => m.gameId === currentGameId);
    if (!current) return { dayPlayed: {}, tournamentPlayed: {} };
    const dayLogs = games
      .filter((m) => !m.deletedAt && sameDay(m.createdAt, current.createdAt))
      .map((m) => logs[m.gameId] ?? []);
    const tournLogs = games
      .filter((m) => !m.deletedAt && m.tournamentId === current.tournamentId)
      .map((m) => logs[m.gameId] ?? []);
    return {
      dayPlayed: sumPlayedAcross(dayLogs),
      tournamentPlayed: sumPlayedAcross(tournLogs),
    };
  }, [games, logs, currentGameId]);

  const active = players.filter((p) => p.active);
  const shown = active
    .filter((p) => matchesView(p, genderView, lineView))
    .sort((a, b) => (predicted[b.id] ?? 0) - (predicted[a.id] ?? 0));

  if (!currentGameId || events.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">Playing time</h1>
        <p className="rounded-lg bg-slate-800 p-6 text-center text-slate-400">
          Load a game from the Games tab to see playing time and predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Playing time</h1>
        <p className="text-sm text-slate-400">
          {meta?.ourTeam} vs {meta?.theirTeam}
          {tournament && <> &middot; {tournament.name}</>} &middot; predictions are
          for this game
        </p>
      </div>

      <GameSettings />
      <ViewFilterBar
        gender={genderView}
        line={lineView}
        onGender={setGenderView}
        onLine={setLineView}
        shown={shown.length}
        total={active.length}
      />

      <div className="rounded-lg bg-slate-800 p-3">
        <div className="mb-2 grid grid-cols-6 text-sm font-semibold text-slate-400">
          <span className="col-span-2">Player</span>
          <span className="text-right">Game</span>
          <span className="text-right">Day</span>
          <span className="text-right">Tourn</span>
          <span className="text-right">Pred</span>
        </div>
        {shown.map((p) => (
          <div key={p.id} className="grid grid-cols-6 border-t border-slate-700 py-1">
            <span className="col-span-2 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  p.gender === 'MMP' ? 'bg-sky-400' : 'bg-fuchsia-400'
                }`}
              />
              {p.name}
              <span className="text-xs text-slate-500">{p.line}</span>
            </span>
            <span className="text-right tabular-nums">{game.played[p.id] ?? 0}</span>
            <span className="text-right tabular-nums text-slate-300">
              {dayPlayed[p.id] ?? 0}
            </span>
            <span className="text-right tabular-nums text-slate-300">
              {tournamentPlayed[p.id] ?? 0}
            </span>
            <span className="text-right tabular-nums text-slate-400">
              {predicted[p.id] ?? 0}{' '}
              <span className="text-xs text-slate-500">
                /{Math.round(targets[p.id] ?? 0)}
              </span>
            </span>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="p-4 text-center text-slate-400">
            {active.length === 0
              ? 'No active players.'
              : 'No players match this view.'}
          </p>
        )}
        <p className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-400">Game</span>,{' '}
          <span className="font-semibold text-slate-400">Day</span>, and{' '}
          <span className="font-semibold text-slate-400">Tourn</span> are points
          played so far this game, today, and this tournament.{' '}
          <span className="font-semibold text-slate-400">Pred</span> is the
          projected points this player finishes the game with, over their target.
        </p>
      </div>
    </div>
  );
}
