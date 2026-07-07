import type { Gender, Line, Player } from './types.ts';

export type ImportedPlayer = Omit<Player, 'id'>;

export interface ImportResult {
  players: ImportedPlayer[];
  errors: string[];
}

/**
 * Parse a pasted roster. One player per line, comma- or tab-separated:
 *   Name, Gender, Line
 * Gender is MMP/M or WMP/W; Line is O or D. A leading header line and blank
 * lines are ignored. Unparseable lines are reported and skipped.
 */
export function parseRosterText(text: string): ImportResult {
  const players: ImportedPlayer[] = [];
  const errors: string[] = [];

  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(/[\t,]/).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: expected "Name, Gender, Line"`);
      return;
    }

    const [name, genderRaw, lineRaw] = parts;
    // Skip a header row.
    if (i === 0 && /^name$/i.test(name)) return;

    const gender = parseGender(genderRaw);
    const linePos = parseLine(lineRaw);
    if (!name) {
      errors.push(`Line ${i + 1}: missing name`);
      return;
    }
    if (!gender) {
      errors.push(`Line ${i + 1}: bad gender "${genderRaw}" (use MMP or WMP)`);
      return;
    }
    if (!linePos) {
      errors.push(`Line ${i + 1}: bad line "${lineRaw}" (use O or D)`);
      return;
    }

    players.push({ name, gender, line: linePos, competitiveness: 0.5, active: true });
  });

  return { players, errors };
}

function parseGender(s: string): Gender | null {
  const v = s.toUpperCase();
  if (v === 'MMP' || v === 'M') return 'MMP';
  if (v === 'WMP' || v === 'W') return 'WMP';
  return null;
}

function parseLine(s: string): Line | null {
  const v = s.toUpperCase();
  if (v === 'O') return 'O';
  if (v === 'D') return 'D';
  return null;
}
