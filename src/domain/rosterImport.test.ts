import { describe, expect, it } from 'vitest';
import { parseRosterText } from './rosterImport.ts';

describe('parseRosterText', () => {
  it('parses comma-separated lines, defaulting competitiveness to 0.5', () => {
    const { players, errors } = parseRosterText('Alex, MMP, O\nSam, W, D');
    expect(errors).toEqual([]);
    expect(players).toEqual([
      { name: 'Alex', gender: 'MMP', line: 'O', competitiveness: 0.5, active: true },
      { name: 'Sam', gender: 'WMP', line: 'D', competitiveness: 0.5, active: true },
    ]);
  });

  it('reads an optional 0-100 competitiveness field', () => {
    const { players, errors } = parseRosterText('Alex, MMP, O, 100\nSam, W, D, 10%');
    expect(errors).toEqual([]);
    expect(players[0].competitiveness).toBe(1);
    expect(players[1].competitiveness).toBeCloseTo(0.1);
  });

  it('reports an out-of-range competitiveness and skips the line', () => {
    const { players, errors } = parseRosterText('Alex, MMP, O, 150');
    expect(players).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('accepts tabs and skips a header and blank lines', () => {
    const { players } = parseRosterText('Name\tGender\tLine\n\nAlex\tM\tO\n');
    expect(players.map((p) => p.name)).toEqual(['Alex']);
  });

  it('reports bad gender/line and missing fields, skipping them', () => {
    const { players, errors } = parseRosterText('Alex, X, O\nSam, MMP, Z\nBad');
    expect(players).toEqual([]);
    expect(errors).toHaveLength(3);
  });
});
