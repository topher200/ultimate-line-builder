import { describe, expect, it } from 'vitest';
import { runDoctor } from './doctor.ts';
import type { Gender, Line, Player } from './types.ts';

function player(id: string, gender: Gender, line: Line, active = true): Player {
  return { id, name: id, gender, line, competitiveness: 0.5, active };
}

function legalRoster(): Player[] {
  return [
    player('m1', 'MMP', 'O'),
    player('m2', 'MMP', 'O'),
    player('m3', 'MMP', 'D'),
    player('m4', 'MMP', 'D'),
    player('w1', 'WMP', 'O'),
    player('w2', 'WMP', 'O'),
    player('w3', 'WMP', 'D'),
    player('w4', 'WMP', 'D'),
  ];
}

describe('runDoctor', () => {
  it('errors when fewer than 7 active players', () => {
    const roster = legalRoster().slice(0, 6);
    const errs = runDoctor(roster, 20).filter((w) => w.level === 'error');
    expect(errs.some((w) => w.message.includes('needs 7'))).toBe(true);
  });

  it('errors when a gender cannot field its 4', () => {
    const roster = legalRoster().map((p) =>
      p.gender === 'MMP' ? { ...p, active: false } : p,
    );
    const errs = runDoctor(roster, 20).filter((w) => w.level === 'error');
    expect(errs.some((w) => w.message.includes('MMP'))).toBe(true);
  });

  it('has no errors for a legal 8-player roster', () => {
    const errs = runDoctor(legalRoster(), 20).filter((w) => w.level === 'error');
    expect(errs).toEqual([]);
  });

  it('warns when there are more active players than half slots', () => {
    const roster = legalRoster();
    // expectedPoints 1 -> 7 slots per half, 8 players.
    const warns = runDoctor(roster, 1).filter((w) => w.level === 'warning');
    expect(warns.some((w) => w.message.includes('not everyone can play'))).toBe(
      true,
    );
  });
});
