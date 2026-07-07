import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { computeTargets, predictGame, selectLine } from '../domain/engine.ts';
import { slotsForMajority } from '../domain/rules.ts';
import { sameDay, sumPlayedAcross } from '../domain/aggregate.ts';
import { ModeSlider } from '../components/ModeSlider.tsx';
import type {
  Line,
  LineupEntry,
  MajorityGender,
  Player,
  Possession,
} from '../domain/types.ts';

export function GameScreen() {
  const currentGameId = useAppStore((s) => s.currentGameId);
  const events = useAppStore((s) => s.events);
  const [starting, setStarting] = useState(false);
  const hasGame = currentGameId != null && events.length > 0;

  if (!hasGame || starting) return <NewGamePanel onStarted={() => setStarting(false)} />;
  return <ActiveGame onNewGame={() => setStarting(true)} />;
}

function NewGamePanel({ onStarted }: { onStarted: () => void }) {
  const newGame = useAppStore((s) => s.newGame);
  const startNewTournament = useAppStore((s) => s.startNewTournament);
  const [possession, setPossession] = useState<Possession>('D');
  const [majority, setMajority] = useState<MajorityGender>('M');
  const [expectedPoints, setExpectedPoints] = useState(20);
  const [mode, setMode] = useState(0);

  const start = () => {
    newGame({
      name: new Date().toLocaleString(),
      startingPossession: possession,
      startingMajority: majority,
      expectedPoints,
      mode,
    });
    onStarted();
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Start a game</h1>
      <Field label="We start on">
        <Segmented
          options={[
            { value: 'O', label: 'Offense' },
            { value: 'D', label: 'Defense' },
          ]}
          value={possession}
          onChange={setPossession}
        />
      </Field>
      <Field label="First point ratio">
        <Segmented
          options={[
            { value: 'M', label: '4 MMP : 3 WMP' },
            { value: 'W', label: '3 MMP : 4 WMP' },
          ]}
          value={majority}
          onChange={setMajority}
        />
      </Field>
      <Field label={`Expected points: ${expectedPoints}`}>
        <input
          type="number"
          min={1}
          max={40}
          value={expectedPoints}
          className="w-24 rounded bg-slate-700 px-3 py-2 text-lg"
          onChange={(e) => setExpectedPoints(Number(e.target.value))}
        />
      </Field>
      <ModeSlider value={mode} onChange={setMode} />
      <button
        className="rounded bg-emerald-600 py-3 text-lg font-semibold"
        onClick={start}
      >
        Start game
      </button>
      <button
        className="rounded bg-slate-700 py-2 text-sm text-slate-300"
        onClick={() => {
          startNewTournament();
          start();
        }}
      >
        Start as a new tournament
      </button>
    </div>
  );
}

function ActiveGame({ onNewGame }: { onNewGame: () => void }) {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);
  const games = useAppStore((s) => s.games);
  const logs = useAppStore((s) => s.logs);
  const currentGameId = useAppStore((s) => s.currentGameId);
  const { game, targets, predicted } = useMemo(() => {
    const g = deriveState(events);
    const t = computeTargets(players, g.expectedPoints, g.mode, 0.5, g.modeBaseline);
    return { game: g, targets: t, predicted: predictGame(g, players, t) };
  }, [events, players]);
  const { dayPlayed, tournamentPlayed } = useMemo(() => {
    const current = games.find((m) => m.gameId === currentGameId);
    if (!current) return { dayPlayed: {}, tournamentPlayed: {} };
    const dayLogs = games
      .filter((m) => sameDay(m.createdAt, current.createdAt))
      .map((m) => logs[m.gameId] ?? []);
    const tournLogs = games
      .filter((m) => m.tournamentId === current.tournamentId)
      .map((m) => logs[m.gameId] ?? []);
    return {
      dayPlayed: sumPlayedAcross(dayLogs),
      tournamentPlayed: sumPlayedAcross(tournLogs),
    };
  }, [games, logs, currentGameId]);
  const recordPoint = useAppStore((s) => s.recordPoint);
  const undoLastPoint = useAppStore((s) => s.undoLastPoint);
  const startSecondHalf = useAppStore((s) => s.startSecondHalf);
  const setMode = useAppStore((s) => s.setMode);
  const setExpectedPoints = useAppStore((s) => s.setExpectedPoints);
  const overridePossession = useAppStore((s) => s.overridePossession);
  const overrideMajority = useAppStore((s) => s.overrideMajority);

  // Which line takes the field. Defaults to the line matching possession; the
  // coach can call the other line for a point (it resets each new point).
  const defaultLine: Line = game.nextPossession;
  const [fieldedLine, setFieldedLine] = useState<Line>(defaultLine);
  useEffect(() => setFieldedLine(defaultLine), [game.totalPoints, defaultLine]);

  const context = {
    possession: game.nextPossession,
    majority: game.nextMajority,
    line: fieldedLine,
  };
  const suggestion = useMemo(
    () => selectLine(game, players, context, targets),
    // Regenerate when the point context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.totalPoints, game.nextPossession, game.nextMajority, game.mode, fieldedLine],
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

  const score = (scoredBy: 'us' | 'them') => recordPoint(lineup, scoredBy);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
      {/* Scoreboard */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
        <div className="text-3xl font-bold tabular-nums">
          Us {game.score.us} <span className="text-slate-500">-</span> {game.score.them} Them
        </div>
        <div className="text-right text-sm text-slate-400">
          <div>Half {game.half}</div>
          <div>Point {game.totalPoints + 1}</div>
        </div>
      </div>

      {/* Point context */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
        <Segmented
          options={[
            { value: 'O', label: 'Offense' },
            { value: 'D', label: 'Defense' },
          ]}
          value={game.nextPossession}
          onChange={overridePossession}
        />
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
            <span className={counts.MMP === slots.MMP ? 'text-slate-400' : 'text-amber-300'}>
              ({counts.MMP} MMP / {counts.WMP} WMP, need {slots.MMP}/{slots.WMP})
            </span>
          </span>
          <button
            className="rounded bg-slate-600 px-3 py-1 text-sm"
            onClick={() => setLineup(suggestion.lineup)}
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
          +1 Us
        </button>
        <button
          className="rounded-lg bg-rose-700 py-5 text-xl font-bold"
          onClick={() => score('them')}
        >
          +1 Them
        </button>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="rounded-lg bg-slate-800 p-3">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Bench (tap to add / sub)
          </div>
          <div className="flex flex-wrap gap-2">
            {bench.map((p) => (
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
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
        <button className="rounded bg-slate-600 px-4 py-2" onClick={undoLastPoint}>
          Undo point
        </button>
        <button className="rounded bg-slate-600 px-4 py-2" onClick={startSecondHalf}>
          Start 2nd half
        </button>
        <button className="rounded bg-slate-600 px-4 py-2" onClick={onNewGame}>
          New game
        </button>
        <label className="flex items-center gap-2 text-sm">
          Expected pts
          <input
            type="number"
            min={1}
            max={40}
            value={game.expectedPoints}
            className="w-16 rounded bg-slate-700 px-2 py-1"
            onChange={(e) => setExpectedPoints(Number(e.target.value))}
          />
        </label>
        <ModeSlider value={game.mode} onChange={setMode} className="flex-1" />
      </div>

      {/* Playing time (no competitiveness ratings shown) */}
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="mb-2 grid grid-cols-6 text-sm font-semibold text-slate-400">
          <span className="col-span-2">Player</span>
          <span className="text-right">Game</span>
          <span className="text-right">Day</span>
          <span className="text-right">Tourn</span>
          <span className="text-right">Pred</span>
        </div>
        {[...players]
          .filter((p) => p.active)
          .sort((a, b) => (predicted[b.id] ?? 0) - (predicted[a.id] ?? 0))
          .map((p) => (
            <div key={p.id} className="grid grid-cols-6 border-t border-slate-700 py-1">
              <span className="col-span-2 flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    p.gender === 'MMP' ? 'bg-sky-400' : 'bg-fuchsia-400'
                  }`}
                />
                {p.name}
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
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded">
      {options.map((o) => (
        <button
          key={o.value}
          className={`px-4 py-2 font-semibold ${
            o.value === value ? 'bg-emerald-600' : 'bg-slate-700 text-slate-300'
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
