import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState } from '../domain/fold.ts';
import { ModeSlider } from '../components/ModeSlider.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { InlineEdit } from '../components/InlineEdit.tsx';
import {
  DEFAULT_EXPECTED_POINTS,
  DEFAULT_OUR_TEAM,
  DEFAULT_THEIR_TEAM,
} from '../domain/defaults.ts';
import type {
  EventEnvelope,
  GameMeta,
  MajorityGender,
  Possession,
  Tournament,
} from '../domain/types.ts';

export function GamesScreen() {
  const tournaments = useAppStore((s) => s.tournaments);
  const games = useAppStore((s) => s.games);
  const logs = useAppStore((s) => s.logs);
  const currentGameId = useAppStore((s) => s.currentGameId);
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const loadGame = useAppStore((s) => s.loadGame);
  const createTournament = useAppStore((s) => s.createTournament);
  const renameTournament = useAppStore((s) => s.renameTournament);
  const deleteTournament = useAppStore((s) => s.deleteTournament);
  const setCurrentTournament = useAppStore((s) => s.setCurrentTournament);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    return tournaments
      .filter((t) => !t.deletedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((t) => ({
        tournament: t,
        games: games
          .filter((g) => g.tournamentId === t.id && !g.deletedAt)
          .sort((a, b) => b.createdAt - a.createdAt),
      }));
  }, [tournaments, games]);

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
        <div className="flex gap-2">
          <button
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold"
            onClick={() => createTournament('')}
          >
            New tournament
          </button>
          <button
            className="rounded bg-emerald-600 px-4 py-2 font-semibold"
            onClick={() => setCreating(true)}
          >
            New game
          </button>
        </div>
      </div>

      {grouped.map(({ tournament, games: tGames }) => (
        <TournamentSection
          key={tournament.id}
          tournament={tournament}
          games={tGames}
          logs={logs}
          currentGameId={currentGameId}
          isCurrent={tournament.id === currentTournamentId}
          onRename={(name) => renameTournament(tournament.id, name)}
          onMakeCurrent={() => setCurrentTournament(tournament.id)}
          onDelete={() => {
            const suffix =
              tGames.length > 0
                ? ` and its ${tGames.length} game${tGames.length === 1 ? '' : 's'}`
                : '';
            if (
              window.confirm(
                `Delete "${tournament.name}"${suffix}? This cannot be undone.`,
              )
            ) {
              deleteTournament(tournament.id);
            }
          }}
          onOpen={open}
        />
      ))}

      {grouped.length === 0 && (
        <p className="rounded-lg bg-slate-800 p-6 text-center text-slate-400">
          No games yet. Start one to begin calling lines.
        </p>
      )}
    </div>
  );
}

function TournamentSection({
  tournament,
  games,
  logs,
  currentGameId,
  isCurrent,
  onRename,
  onMakeCurrent,
  onDelete,
  onOpen,
}: {
  tournament: Tournament;
  games: GameMeta[];
  logs: Record<string, EventEnvelope[]>;
  currentGameId: string | null;
  isCurrent: boolean;
  onRename: (name: string) => void;
  onMakeCurrent: () => void;
  onDelete: () => void;
  onOpen: (gameId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <InlineEdit
          value={tournament.name}
          onChange={onRename}
          className="text-lg font-bold"
        />
        {isCurrent ? (
          <span className="rounded bg-emerald-800 px-2 py-0.5 text-xs font-semibold text-emerald-200">
            Current
          </span>
        ) : (
          <button
            className="text-xs text-slate-400 underline"
            onClick={onMakeCurrent}
          >
            Make current
          </button>
        )}
        <button
          className="ml-auto text-xs text-slate-500 underline hover:text-red-400"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      {games.length === 0 && (
        <p className="rounded-lg bg-slate-800/60 p-3 text-sm text-slate-500">
          No games in this tournament yet.
        </p>
      )}
      {games.map((g) => (
        <GameRow
          key={g.gameId}
          game={g}
          state={deriveState(logs[g.gameId] ?? [])}
          current={g.gameId === currentGameId}
          onOpen={() => onOpen(g.gameId)}
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
  const tournaments = useAppStore((s) => s.tournaments);
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const current = tournaments.find((t) => t.id === currentTournamentId);
  const [ourTeam, setOurTeam] = useState(DEFAULT_OUR_TEAM);
  const [theirTeam, setTheirTeam] = useState(DEFAULT_THEIR_TEAM);
  const [possession, setPossession] = useState<Possession>('D');
  const [majority, setMajority] = useState<MajorityGender>('M');
  const [expectedPoints, setExpectedPoints] = useState(DEFAULT_EXPECTED_POINTS);
  const [mode, setMode] = useState(0);

  const start = () => {
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

      <p className="text-sm text-slate-400">
        In tournament <span className="font-semibold text-slate-200">{current?.name}</span>.
        Switch or add a tournament on the Games list.
      </p>

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
      <Field label="Start the ratio on">
        <Segmented
          options={[
            { value: 'M', label: 'M2 (4M : 3W)' },
            { value: 'W', label: 'W2 (3M : 4W)' },
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
