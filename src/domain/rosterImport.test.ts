import { describe, expect, it } from 'vitest';
import { parseRosterText } from './rosterImport.ts';

describe('parseRosterText', () => {
  it('parses comma-separated lines with defaults', () => {
    const { players, errors } = parseRosterText('Alex, MMP, O\nSam, W, D');
    expect(errors).toEqual([]);
    expect(players).toEqual([
      { name: 'Alex', gender: 'MMP', line: 'O', competitiveness: 0.5, active: true },
      { name: 'Sam', gender: 'WMP', line: 'D', competitiveness: 0.5, active: true },
    ]);
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
