import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState, freshGameState } from '../domain/fold.ts';
import { computeTargets, predictGame } from '../domain/engine.ts';
import { GameSettings } from '../components/GameSettings.tsx';
import type { MajorityGender, Possession } from '../domain/types.ts';

type View = 'all' | 'O' | 'D';

export function PredictorScreen() {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);

  const [possession, setPossession] = useState<Possession>('D');
  const [majority, setMajority] = useState<MajorityGender>('M');
  const [view, setView] = useState<View>('all');

  // Expected points and competitiveness are the live game's, shared with the
  // other screens; possession, ratio, and line view are Predictor what-ifs.
  const { expectedPoints, mode } = useMemo(() => deriveState(events), [events]);

  const predicted = useMemo(() => {
    const game = freshGameState({
      startingPossession: possession,
      startingMajority: majority,
      expectedPoints,
      mode,
    });
    const targets = computeTargets(players, expectedPoints, mode);
    return predictGame(game, players, targets, {
      forcePossession: view === 'all' ? undefined : view,
    });
  }, [players, possession, majority, expectedPoints, mode, view]);

  const shown = players
    .filter((p) => p.active && (view === 'all' || p.line === view))
    .sort((a, b) => (predicted[b.id] ?? 0) - (predicted[a.id] ?? 0));
  const maxPred = Math.max(1, ...shown.map((p) => predicted[p.id] ?? 0));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Predictor</h1>
      <p className="text-sm text-slate-400">
        Project a whole game from the current roster and settings. O and D
        points alternate through the game; switch the View to project a single
        line instead.
      </p>

      <div className="flex flex-wrap gap-3 rounded-lg bg-slate-800 p-3">
        <Field label="Start on">
          <Segmented
            options={[
              { value: 'O', label: 'O' },
              { value: 'D', label: 'D' },
            ]}
            value={possession}
            onChange={setPossession}
          />
        </Field>
        <Field label="First ratio">
          <Segmented
            options={[
              { value: 'M', label: '4M:3W' },
              { value: 'W', label: '3M:4W' },
            ]}
            value={majority}
            onChange={setMajority}
          />
        </Field>
        <Field label="View">
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'O', label: 'O line' },
              { value: 'D', label: 'D line' },
            ]}
            value={view}
            onChange={setView}
          />
        </Field>
      </div>

      <GameSettings />

      <div className="flex flex-col gap-1 rounded-lg bg-slate-800 p-3">
        {shown.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-1">
            <span className="flex w-40 items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  p.gender === 'MMP' ? 'bg-sky-400' : 'bg-fuchsia-400'
                }`}
              />
              {p.name}
              <span className="text-xs text-slate-500">{p.line}</span>
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-700">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${((predicted[p.id] ?? 0) / maxPred) * 100}%`,
                }}
              />
            </div>
            <span className="w-10 text-right tabular-nums">
              {predicted[p.id] ?? 0}
            </span>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="p-4 text-center text-slate-400">
            Add active players on the Roster screen to simulate.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
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
          className={`px-3 py-2 text-sm font-semibold ${
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
