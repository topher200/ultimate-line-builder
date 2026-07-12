import { useState } from 'react';
import { useAppStore } from '../store/useAppStore.ts';
import { runDoctor } from '../domain/doctor.ts';
import { DEFAULT_EXPECTED_POINTS } from '../domain/defaults.ts';
import { parseRosterText } from '../domain/rosterImport.ts';
import { ViewFilterBar } from '../components/ViewFilterBar.tsx';
import { InlineEdit } from '../components/InlineEdit.tsx';
import {
  matchesView,
  type GenderView,
  type LineView,
} from '../components/viewFilter.ts';
import type { Gender, Line } from '../domain/types.ts';

export function RosterScreen() {
  const players = useAppStore((s) => s.players);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('MMP');
  const [line, setLine] = useState<Line>('O');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [genderView, setGenderView] = useState<GenderView>('ALL');
  const [lineView, setLineView] = useState<LineView>('ALL');
  const [sort, setSort] = useState<'name' | 'rating'>('name');

  const runImport = () => {
    const { players: parsed, errors } = parseRosterText(importText);
    for (const p of parsed) addPlayer(p);
    setImportErrors(errors);
    if (errors.length === 0) {
      setImportText('');
      setShowImport(false);
    }
  };

  const warnings = runDoctor(players, DEFAULT_EXPECTED_POINTS);
  const sorted = [...players]
    .filter((p) => matchesView(p, genderView, lineView))
    .sort((a, b) =>
      sort === 'rating'
        ? b.competitiveness - a.competitiveness || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Roster</h1>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-slate-800 p-3">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Doctor
          </div>
          {warnings.map((w, i) => (
            <div
              key={i}
              className={w.level === 'error' ? 'text-red-400' : 'text-amber-300'}
            >
              {w.level === 'error' ? '✖' : '⚠'} {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-800 p-3">
        <input
          className="min-w-40 flex-1 rounded bg-slate-700 px-3 py-2 text-lg"
          placeholder="Player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Toggle
          options={['MMP', 'WMP']}
          value={gender}
          onChange={(v) => setGender(v as Gender)}
        />
        <Toggle options={['O', 'D']} value={line} onChange={(v) => setLine(v as Line)} />
        <button
          className="rounded bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-40"
          disabled={!name.trim()}
          onClick={() => {
            addPlayer({
              name: name.trim(),
              gender,
              line,
              competitiveness: 0.5,
              active: true,
            });
            setName('');
          }}
        >
          Add
        </button>
        <button
          className="rounded bg-slate-600 px-4 py-2 font-semibold"
          onClick={() => setShowImport((v) => !v)}
        >
          Import
        </button>
      </div>

      {showImport && (
        <div className="flex flex-col gap-2 rounded-lg bg-slate-800 p-3">
          <div className="text-sm text-slate-400">
            One player per line: <code>Name, Gender, Line, Competitiveness</code>{' '}
            (Gender = MMP or WMP, Line = O or D, Competitiveness = 0-100 and
            optional, default 50). Comma or tab separated.
          </div>
          <textarea
            className="h-40 w-full rounded bg-slate-700 px-3 py-2 font-mono text-sm"
            placeholder={'Alex, MMP, D, 100\nSam, WMP, O, 40'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importErrors.length > 0 && (
            <div className="flex flex-col gap-1 text-sm text-amber-300">
              {importErrors.map((err, i) => (
                <div key={i}>⚠ {err}</div>
              ))}
            </div>
          )}
          <button
            className="self-start rounded bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-40"
            disabled={!importText.trim()}
            onClick={runImport}
          >
            Add these players
          </button>
        </div>
      )}

      {players.length > 0 && (
        <ViewFilterBar
          gender={genderView}
          line={lineView}
          onGender={setGenderView}
          onLine={setLineView}
          shown={sorted.length}
          total={players.length}
        />
      )}

      {players.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
          <span className="text-sm font-semibold text-slate-400">Sort</span>
          <Toggle
            options={['Name', 'Rating']}
            value={sort === 'name' ? 'Name' : 'Rating'}
            onChange={(v) => setSort(v === 'Rating' ? 'rating' : 'name')}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col gap-2 rounded-lg p-3 ${
              p.active ? 'bg-slate-800' : 'bg-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-2 py-0.5 text-sm font-bold ${
                  p.gender === 'MMP' ? 'bg-sky-700' : 'bg-fuchsia-700'
                }`}
              >
                {p.gender}
              </span>
              <button
                className="rounded bg-slate-600 px-2 py-0.5 text-sm font-semibold"
                onClick={() =>
                  updatePlayer(p.id, { line: p.line === 'O' ? 'D' : 'O' })
                }
              >
                {p.line}
              </button>
              <InlineEdit
                value={p.name}
                onChange={(v) => updatePlayer(p.id, { name: v })}
                className={`flex-1 text-left text-lg ${
                  p.active ? '' : 'line-through opacity-60'
                }`}
              />
              <button
                className={`rounded px-3 py-1 text-sm font-semibold ${
                  p.active ? 'bg-emerald-700' : 'bg-slate-600'
                }`}
                onClick={() => updatePlayer(p.id, { active: !p.active })}
              >
                {p.active ? 'Active' : 'Out'}
              </button>
              <button
                className="rounded bg-slate-700 px-3 py-1 text-sm text-red-300"
                onClick={() => removePlayer(p.id)}
              >
                Delete
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-28 text-sm text-slate-400">Competitiveness</span>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={Math.round(p.competitiveness * 100)}
                className="flex-1"
                onChange={(e) =>
                  updatePlayer(p.id, { competitiveness: Number(e.target.value) / 100 })
                }
              />
              <span className="w-12 text-right tabular-nums">
                {Math.round(p.competitiveness * 100)}%
              </span>
            </div>
          </div>
        ))}
        {players.length === 0 && (
          <p className="p-6 text-center text-slate-400">
            Add players one at a time, or use Import to paste the whole team.
          </p>
        )}
        {players.length > 0 && sorted.length === 0 && (
          <p className="p-6 text-center text-slate-400">
            No players match this view.
          </p>
        )}
      </div>
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded">
      {options.map((o) => (
        <button
          key={o}
          className={`px-4 py-2 font-semibold ${
            o === value ? 'bg-emerald-600' : 'bg-slate-700 text-slate-300'
          }`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
