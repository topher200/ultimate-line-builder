import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { computeTargets, simulateGame, type SimulatedPoint } from '../domain/engine.ts';
import { modeLabel } from '../components/ModeSlider.tsx';
import type { Player } from '../domain/types.ts';

export function SimulatorScreen() {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);
  const currentGameId = useAppStore((s) => s.currentGameId);

  const { game, points } = useMemo(() => {
    const g = deriveState(events);
    const targets = computeTargets(players, g.expectedPoints, g.mode, 0.5, g.modeBaseline);
    return { game: g, points: simulateGame(g, players, targets) };
  }, [events, players]);

  const byId = (id: string) => players.find((p) => p.id === id);
  const hasGame = currentGameId != null && events.length > 0;

  if (!hasGame) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-slate-400">
        Start a game on the Game screen to simulate the rest of it.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Simulator</h1>
        <p className="text-sm text-slate-400">
          Plays the rest of this game out point by point in{' '}
          <span className="font-semibold text-slate-200">{modeLabel(game.mode)}</span>{' '}
          mode, trading O and D, from the current score and next point. The number
          by each name is how many points they'll have played this game after that
          point.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-800 p-3 text-sm">
        <span className="text-lg font-bold tabular-nums">
          Us {game.score.us} <span className="text-slate-500">-</span> {game.score.them} Them
        </span>
        <span className="text-slate-400">Half {game.half}</span>
        <span className="text-slate-400">
          {points.length} point{points.length === 1 ? '' : 's'} left of{' '}
          {game.expectedPoints}
        </span>
      </div>

      {points.length === 0 ? (
        <p className="rounded-lg bg-slate-800 p-4 text-center text-slate-400">
          Game is complete at the expected points.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {points.map((pt) => (
            <PointRow key={pt.index} pt={pt} byId={byId} />
          ))}
        </div>
      )}
    </div>
  );
}

function PointRow({
  pt,
  byId,
}: {
  pt: SimulatedPoint;
  byId: (id: string) => Player | undefined;
}) {
  return (
    <div className="rounded-lg bg-slate-800 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
        <span className="w-14 font-semibold text-slate-200">#{pt.index}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            pt.line === 'O' ? 'bg-emerald-800 text-emerald-200' : 'bg-indigo-800 text-indigo-200'
          }`}
        >
          {pt.line} line
        </span>
        <span className="text-xs">
          {pt.possession === 'O' ? 'offense' : 'defense'}
        </span>
        <span className="text-xs">{pt.majority === 'M' ? '4M:3W' : '3M:4W'}</span>
        <span className="text-xs text-slate-500">H{pt.half}</span>
        {pt.short && (
          <span className="text-xs font-semibold text-amber-300">short a slot</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {pt.lineup.map((id) => {
          const p = byId(id);
          if (!p) return null;
          return (
            <span
              key={id}
              className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                p.gender === 'MMP' ? 'bg-sky-800' : 'bg-fuchsia-800'
              }`}
            >
              {p.name}
              <span className="rounded bg-black/30 px-1.5 text-xs tabular-nums">
                {(pt.playedBefore[id] ?? 0) + 1}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
