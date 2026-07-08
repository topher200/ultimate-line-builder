import { useMemo } from 'react';
import { deriveState } from '../domain/fold.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { ModeSlider } from './ModeSlider.tsx';

/**
 * Expected-points and competitiveness controls for the current game. These edit
 * the game itself (via the event log), so every screen that shows them reads and
 * writes the same live values.
 */
export function GameSettings({ className }: { className?: string }) {
  const events = useAppStore((s) => s.events);
  const setMode = useAppStore((s) => s.setMode);
  const setExpectedPoints = useAppStore((s) => s.setExpectedPoints);
  const game = useMemo(() => deriveState(events), [events]);

  if (events.length === 0) {
    return (
      <div
        className={`rounded-lg bg-slate-800 p-3 text-sm text-slate-400 ${className ?? ''}`}
      >
        Start a game to set expected points and competitiveness.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-lg bg-slate-800 p-3 ${className ?? ''}`}
    >
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
  );
}
