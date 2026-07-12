import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { sameDay, sumPlayedAcross } from '../domain/aggregate.ts';
import { ViewFilterBar } from '../components/ViewFilterBar.tsx';
import {
  matchesView,
  type GenderView,
  type LineView,
} from '../components/viewFilter.ts';
import { GameSettings } from '../components/GameSettings.tsx';

type SortKey = 'game' | 'day' | 'tourn';

function SortHeader({
  label,
  col,
  sortKey,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button
      className={`text-right ${active ? 'text-emerald-400' : 'text-slate-400'}`}
      onClick={() => onSort(col)}
    >
      {label}
      {active ? ' ▾' : ''}
    </button>
  );
}

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
  const [sortKey, setSortKey] = useState<SortKey>('game');

  const game = useMemo(() => deriveState(events), [events]);

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

  const valueFor = (id: string, key: SortKey): number => {
    switch (key) {
      case 'game':
        return game.played[id] ?? 0;
      case 'day':
        return dayPlayed[id] ?? 0;
      case 'tourn':
        return tournamentPlayed[id] ?? 0;
    }
  };

  const active = players.filter((p) => p.active);
  const shown = active
    .filter((p) => matchesView(p, genderView, lineView))
    .sort(
      (a, b) =>
        valueFor(b.id, sortKey) - valueFor(a.id, sortKey) ||
        a.name.localeCompare(b.name),
    );

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
          {tournament && <> &middot; {tournament.name}</>} &middot; points played
          this game, day, and tournament
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
        <div className="mb-2 grid grid-cols-5 text-sm font-semibold text-slate-400">
          <span className="col-span-2">Player</span>
          <SortHeader label="Game" col="game" sortKey={sortKey} onSort={setSortKey} />
          <SortHeader label="Day" col="day" sortKey={sortKey} onSort={setSortKey} />
          <SortHeader label="Tourn" col="tourn" sortKey={sortKey} onSort={setSortKey} />
        </div>
        {shown.map((p) => (
          <div key={p.id} className="grid grid-cols-5 border-t border-slate-700 py-1">
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
          played so far this game, today, and this tournament. See the Predictor
          screen for projected points and targets.
        </p>
      </div>
    </div>
  );
}
