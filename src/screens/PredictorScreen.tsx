import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { deriveState, freshGameState } from '../domain/fold.ts';
import { computeTargets, predictGame } from '../domain/engine.ts';
import { GameSettings } from '../components/GameSettings.tsx';
import { ViewFilterBar } from '../components/ViewFilterBar.tsx';
import { Segmented } from '../components/Segmented.tsx';
import {
  matchesView,
  type GenderView,
  type LineView,
} from '../components/viewFilter.ts';
import type { MajorityGender, Possession } from '../domain/types.ts';

export function PredictorScreen() {
  const players = useAppStore((s) => s.players);
  const events = useAppStore((s) => s.events);

  const [possession, setPossession] = useState<Possession>('D');
  const [majority, setMajority] = useState<MajorityGender>('M');
  const [genderView, setGenderView] = useState<GenderView>('ALL');
  const [lineView, setLineView] = useState<LineView>('ALL');

  // Expected points and competitiveness are the live game's, shared with the
  // other screens; possession and ratio are Predictor what-ifs.
  const { expectedPoints, mode } = useMemo(() => deriveState(events), [events]);

  const { predicted, targets } = useMemo(() => {
    const game = freshGameState({
      startingPossession: possession,
      startingMajority: majority,
      expectedPoints,
      mode,
    });
    const t = computeTargets(players, expectedPoints, mode);
    // O and D points always trade, so each player only plays their own line's
    // points. The view filters who is listed; it never changes the simulation,
    // so a single line's numbers are the same whether or not the other shows.
    return { predicted: predictGame(game, players, t), targets: t };
  }, [players, possession, majority, expectedPoints, mode]);

  const active = players.filter((p) => p.active);
  const shown = active
    .filter((p) => matchesView(p, genderView, lineView))
    .sort((a, b) => (predicted[b.id] ?? 0) - (predicted[a.id] ?? 0));
  const maxPred = Math.max(1, ...shown.map((p) => predicted[p.id] ?? 0));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Predictor</h1>
      <p className="text-sm text-slate-400">
        Project a whole game from the current roster and settings. O and D points
        alternate through the game; the View filters which players are listed
        without changing anyone's projection.
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
        <Field label="Start ratio">
          <Segmented
            options={[
              { value: 'M', label: 'M2' },
              { value: 'W', label: 'W2' },
            ]}
            value={majority}
            onChange={setMajority}
          />
        </Field>
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
            <span className="w-16 text-right tabular-nums">
              {predicted[p.id] ?? 0}
              <span className="text-xs text-slate-500">
                {' '}
                /{Math.round(targets[p.id] ?? 0)}
              </span>
            </span>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="p-4 text-center text-slate-400">
            {active.length === 0
              ? 'Add active players on the Roster screen to simulate.'
              : 'No players match this view.'}
          </p>
        )}
        <p className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-500">
          Each row shows{' '}
          <span className="font-semibold text-slate-400">predicted</span> points
          this game over the player&apos;s{' '}
          <span className="font-semibold text-slate-400">target</span>.
        </p>
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
