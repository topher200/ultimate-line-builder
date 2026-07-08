import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { RosterScreen } from './screens/RosterScreen.tsx';
import { GameScreen } from './screens/GameScreen.tsx';
import { PredictorScreen } from './screens/PredictorScreen.tsx';
import { PlayingTimeScreen } from './screens/PlayingTimeScreen.tsx';
import { useAppStore } from './store/useAppStore.ts';

const tabs = [
  { to: '/game', label: 'Game' },
  { to: '/playing-time', label: 'Playing Time' },
  { to: '/roster', label: 'Roster' },
  { to: '/predictor', label: 'Predictor' },
];

export function App() {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900 text-slate-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/game" replace />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/playing-time" element={<PlayingTimeScreen />} />
          <Route path="/roster" element={<RosterScreen />} />
          <Route path="/predictor" element={<PredictorScreen />} />
        </Routes>
      </main>
      <nav className="flex shrink-0 border-t border-slate-700">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex-1 py-4 text-center text-lg font-semibold ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
