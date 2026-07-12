import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { computeTargets, selectLine } from '../domain/engine.ts';
import { pointLabel, slotsForMajority } from '../domain/rules.ts';
import { Segmented } from '../components/Segmented.tsx';
import { InlineEdit } from '../components/InlineEdit.tsx';
import { GameSettings } from '../components/GameSettings.tsx';
import { GameTimeline } from './GameTimeline.tsx';
import type { Line, LineupEntry, Player } from '../domain/types.ts';

export function GameScreen() {
  const currentGameId = useAppStore((s) => s.currentGameId);
  const events = useAppStore((s) => s.events);
  const navigate = useNavigate();
  const hasGame = currentGameId != null && events.length > 0;

  if (!hasGame) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <h1 className="text-2xl font-bold">No game loaded</h1>
        <p className="text-slate-400">Pick a game or start a new one.</p>
        <button
          className="rounded bg-emerald-600 px-6 py-3 font-semibold"
          onClick={() => navigate('/games')}
        >
          Go to Games
        </button>
      </div>
    );
  }
  return <ActiveGame />;
}

function ActiveGame() {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);
  const games = useAppStore((s) => s.games);
  const currentGameId = useAppStore((s) => s.currentGameId);
  const meta = games.find((g) => g.gameId === currentGameId);
  const { game, targets } = useMemo(() => {
    const g = deriveState(events);
    const t = computeTargets(players, g.expectedPoints, g.mode, 0.5, g.modeBaseline);
    return { game: g, targets: t };
  }, [events, players]);
  const recordPoint = useAppStore((s) => s.recordPoint);
  const undoLast = useAppStore((s) => s.undoLast);
  const startSecondHalf = useAppStore((s) => s.startSecondHalf);
  const overrideMajority = useAppStore((s) => s.overrideMajority);
  const setStartingPossession = useAppStore((s) => s.setStartingPossession);
  const setStartingMajority = useAppStore((s) => s.setStartingMajority);
  const updateGameMeta = useAppStore((s) => s.updateGameMeta);

  // Which line takes the field. Defaults to the line matching possession; the
  // coach can call the other line for a point (it resets each new point).
  const defaultLine: Line = game.nextPossession;
  const [fieldedLine, setFieldedLine] = useState<Line>(defaultLine);
  useEffect(() => setFieldedLine(defaultLine), [game.totalPoints, defaultLine]);

  // Bumping this re-picks the line with jitter, so a reshuffle varies the slack
  // slots. It resets to a clean deterministic pick each new point.
  const [reshuffle, setReshuffle] = useState(0);
  useEffect(() => setReshuffle(0), [game.totalPoints]);

  const context = {
    possession: game.nextPossession,
    majority: game.nextMajority,
    line: fieldedLine,
  };
  const suggestion = useMemo(
    () => selectLine(game, players, context, targets, { jitter: reshuffle > 0 ? 2 : 0 }),
    // Regenerate when the point context changes or a reshuffle is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.totalPoints, game.nextPossession, game.nextMajority, game.mode, fieldedLine, reshuffle],
  );

  const [lineup, setLineup] = useState<LineupEntry[]>(suggestion.lineup);
  useEffect(() => setLineup(suggestion.lineup), [suggestion]);

  const byId = (id: string) => players.find((p) => p.id === id)!;
  const inLineup = new Set(lineup.map((l) => l.playerId));
  const bench = players.filter((p) => p.active && !inLineup.has(p.id));
  const slots = slotsForMajority(game.nextMajority);
  const counts = {
    MMP: lineup.filter((l) => byId(l.playerId)?.gender === 'MMP').length,
    WMP: lineup.filter((l) => byId(l.playerId)?.gender === 'WMP').length,
  };
  const ratioOk = counts.MMP === slots.MMP && counts.WMP === slots.WMP;

  const score = (scoredBy: 'us' | 'them') => recordPoint(lineup, scoredBy);
  const rename = (patch: { ourTeam?: string; theirTeam?: string }) => {
    if (currentGameId) updateGameMeta(currentGameId, patch);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
      {/* Scoreboard */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
        <div className="flex items-center gap-2 text-3xl font-bold tabular-nums">
          <InlineEdit
            value={meta?.ourTeam ?? 'Us'}
            onChange={(v) => rename({ ourTeam: v })}
            className="text-lg font-semibold text-slate-300"
          />
          <span>{game.score.us}</span>
          <span className="text-slate-500">-</span>
          <span>{game.score.them}</span>
          <InlineEdit
            value={meta?.theirTeam ?? 'Them'}
            onChange={(v) => rename({ theirTeam: v })}
            className="text-lg font-semibold text-slate-300"
          />
        </div>
        <div className="text-right text-sm text-slate-400">
          <div>Half {game.half}</div>
          <div>
            Point {game.totalPoints + 1} &middot;{' '}
            <span className="font-semibold text-slate-200">
              {pointLabel(game.totalPoints + 1, game.nextMajority)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-500">
            <span>Started on</span>
            <button
              className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-200"
              onClick={() =>
                setStartingPossession(game.startingPossession === 'O' ? 'D' : 'O')
              }
            >
              {game.startingPossession}
            </button>
            <button
              className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-200"
              onClick={() =>
                setStartingMajority(game.startingMajority === 'M' ? 'W' : 'M')
              }
            >
              {pointLabel(1, game.startingMajority)}
            </button>
          </div>
        </div>
      </div>

      {/* Point context */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
        <Segmented
          options={[
            { value: 'M', label: '4M:3W' },
            { value: 'W', label: '3M:4W' },
          ]}
          value={game.nextMajority}
          onChange={overrideMajority}
        />
        <div className="flex items-center gap-2">
          <Segmented
            options={[
              { value: 'O', label: 'O line' },
              { value: 'D', label: 'D line' },
            ]}
            value={fieldedLine}
            onChange={setFieldedLine}
          />
          {fieldedLine !== defaultLine && (
            <span className="text-xs font-semibold text-amber-300">
              calling {fieldedLine} line on {game.nextPossession === 'O' ? 'offense' : 'defense'}
            </span>
          )}
        </div>
      </div>

      {/* Suggested line */}
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">
            Line{' '}
            <span
              className={
                ratioOk
                  ? 'text-slate-400'
                  : 'rounded bg-red-500/20 px-1.5 py-0.5 font-semibold text-red-300'
              }
            >
              ({counts.MMP} MMP / {counts.WMP} WMP, need {slots.MMP}/{slots.WMP})
            </span>
          </span>
          <button
            className="rounded bg-slate-600 px-3 py-1 text-sm"
            onClick={() => setReshuffle((n) => n + 1)}
          >
            Reshuffle
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {lineup.map((entry) => (
            <PlayerChip
              key={entry.playerId + (entry.injurySubFor ?? '')}
              player={byId(entry.playerId)}
              sub={entry.injurySubFor != null}
              onRemove={() =>
                setLineup(lineup.filter((l) => l.playerId !== entry.playerId))
              }
            />
          ))}
        </div>
        {suggestion.short && (
          <p className="mt-2 text-sm text-amber-300">
            Not enough active players to fill the ratio.
          </p>
        )}
      </div>

      {/* Score buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          className="rounded-lg bg-emerald-600 py-5 text-xl font-bold"
          onClick={() => score('us')}
        >
          +1 {meta?.ourTeam ?? 'Us'}
        </button>
        <button
          className="rounded-lg bg-rose-700 py-5 text-xl font-bold"
          onClick={() => score('them')}
        >
          +1 {meta?.theirTeam ?? 'Them'}
        </button>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="rounded-lg bg-slate-800 p-3">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Bench (tap to add / sub)
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['O', 'D'] as Line[]).map((line) => {
              const onBench = bench.filter((p) => p.line === line);
              return (
                <div key={line}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {line} line
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onBench.map((p) => (
                      <button
                        key={p.id}
                        className={`rounded px-3 py-2 ${
                          p.gender === 'MMP' ? 'bg-sky-800' : 'bg-fuchsia-800'
                        }`}
                        onClick={() => setLineup([...lineup, { playerId: p.id }])}
                      >
                        {p.name}
                      </button>
                    ))}
                    {onBench.length === 0 && (
                      <span className="text-xs text-slate-600">none</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
        <button className="rounded bg-slate-600 px-4 py-2" onClick={undoLast}>
          Undo last point
        </button>
        <button
          className={`rounded px-4 py-2 ${
            game.half === 2
              ? 'cursor-default bg-slate-700 text-slate-500'
              : 'bg-slate-600'
          }`}
          onClick={startSecondHalf}
          disabled={game.half === 2}
        >
          {game.half === 2 ? '2nd half started' : 'Start 2nd half'}
        </button>
      </div>

      <GameSettings />

      <GameTimeline events={events} players={players} game={game} targets={targets} />
    </div>
  );
}

function PlayerChip({
  player,
  sub,
  onRemove,
}: {
  player: Player;
  sub: boolean;
  onRemove: () => void;
}) {
  return (
    <button
      className={`flex items-center justify-between rounded-lg px-3 py-3 text-left ${
        player.gender === 'MMP' ? 'bg-sky-700' : 'bg-fuchsia-700'
      }`}
      onClick={onRemove}
    >
      <span className="font-semibold">
        {player.name}
        {sub && <span className="ml-1 text-xs opacity-80">(sub)</span>}
      </span>
      <span className="text-xs opacity-70">{player.gender}</span>
    </button>
  );
}
