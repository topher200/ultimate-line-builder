import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { ModeSlider } from '../components/ModeSlider.tsx';
import { Segmented } from '../components/Segmented.tsx';
import {
  DEFAULT_EXPECTED_POINTS,
  DEFAULT_OUR_TEAM,
  DEFAULT_THEIR_TEAM,
} from '../domain/defaults.ts';
import type { GameMeta, MajorityGender, Possession } from '../domain/types.ts';

export function GamesScreen() {
  const games = useAppStore((s) => s.games);
  const logs = useAppStore((s) => s.logs);
  const currentGameId = useAppStore((s) => s.currentGameId);
  const loadGame = useAppStore((s) => s.loadGame);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(
    () => [...games].sort((a, b) => b.createdAt - a.createdAt),
    [games],
  );

  const open = (gameId: string) => {
    loadGame(gameId);
    navigate('/game');
  };

  if (creating) {
    return (
      <NewGameForm
        onStarted={() => {
          setCreating(false);
          navigate('/game');
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games</h1>
        <button
          className="rounded bg-emerald-600 px-4 py-2 font-semibold"
          onClick={() => setCreating(true)}
        >
          New game
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="rounded-lg bg-slate-800 p-6 text-center text-slate-400">
          No games yet. Start one to begin calling lines.
        </p>
      )}

      {sorted.map((g) => (
        <GameRow
          key={g.gameId}
          game={g}
          state={deriveState(logs[g.gameId] ?? [])}
          current={g.gameId === currentGameId}
          onOpen={() => open(g.gameId)}
        />
      ))}
    </div>
  );
}

function GameRow({
  game,
  state,
  current,
  onOpen,
}: {
  game: GameMeta;
  state: ReturnType<typeof deriveState>;
  current: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={`flex items-center justify-between rounded-lg p-4 text-left ${
        current ? 'bg-slate-700 ring-2 ring-emerald-500' : 'bg-slate-800'
      }`}
      onClick={onOpen}
    >
      <div>
        <div className="text-lg font-semibold">
          {game.ourTeam} <span className="text-slate-500">vs</span> {game.theirTeam}
        </div>
        <div className="text-sm text-slate-400">
          {new Date(game.createdAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          &middot; {state.totalPoints} pts
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold tabular-nums">
          {state.score.us} <span className="text-slate-500">-</span> {state.score.them}
        </div>
        {current && (
          <div className="text-xs font-semibold uppercase text-emerald-400">Open</div>
        )}
      </div>
    </button>
  );
}

function NewGameForm({
  onStarted,
  onCancel,
}: {
  onStarted: () => void;
  onCancel: () => void;
}) {
  const newGame = useAppStore((s) => s.newGame);
  const startNewTournament = useAppStore((s) => s.startNewTournament);
  const [ourTeam, setOurTeam] = useState(DEFAULT_OUR_TEAM);
  const [theirTeam, setTheirTeam] = useState(DEFAULT_THEIR_TEAM);
  const [possession, setPossession] = useState<Possession>('D');
  const [majority, setMajority] = useState<MajorityGender>('M');
  const [expectedPoints, setExpectedPoints] = useState(DEFAULT_EXPECTED_POINTS);
  const [mode, setMode] = useState(0);

  const start = (newTournament: boolean) => {
    if (newTournament) startNewTournament();
    newGame({
      name: new Date().toLocaleString(),
      ourTeam: ourTeam.trim() || DEFAULT_OUR_TEAM,
      theirTeam: theirTeam.trim() || DEFAULT_THEIR_TEAM,
      startingPossession: possession,
      startingMajority: majority,
      expectedPoints,
      mode,
    });
    onStarted();
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Start a game</h1>
        <button className="text-sm text-slate-400" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Our team">
          <input
            value={ourTeam}
            className="rounded bg-slate-700 px-3 py-2 text-lg"
            onChange={(e) => setOurTeam(e.target.value)}
          />
        </Field>
        <Field label="Opponent">
          <input
            value={theirTeam}
            className="rounded bg-slate-700 px-3 py-2 text-lg"
            onChange={(e) => setTheirTeam(e.target.value)}
          />
        </Field>
      </div>

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
        onClick={() => start(false)}
      >
        Start game
      </button>
      <button
        className="rounded bg-slate-700 py-2 text-sm text-slate-300"
        onClick={() => start(true)}
      >
        Start as a new tournament
      </button>
    </div>
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
