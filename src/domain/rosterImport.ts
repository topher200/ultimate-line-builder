import type { Gender, Line, Player } from './types.ts';

export type ImportedPlayer = Omit<Player, 'id'>;

export interface ImportResult {
  players: ImportedPlayer[];
  errors: string[];
}

/**
 * Parse a pasted roster. One player per line, comma- or tab-separated:
 *   Name, Gender, Line[, Competitiveness]
 * Gender is MMP/M or WMP/W; Line is O or D. Competitiveness is an optional
 * 0-100 percentage (default 50). A leading header line and blank lines are
 * ignored. Unparseable lines are reported and skipped.
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
      errors.push(`Line ${i + 1}: expected "Name, Gender, Line[, Competitiveness]"`);
      return;
    }

    const [name, genderRaw, lineRaw, competitivenessRaw] = parts;
    // Skip a header row.
    if (i === 0 && /^name$/i.test(name)) return;

    const gender = parseGender(genderRaw);
    const linePos = parseLine(lineRaw);
    const competitiveness = parseCompetitiveness(competitivenessRaw);
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
    if (competitiveness === null) {
      errors.push(
        `Line ${i + 1}: bad competitiveness "${competitivenessRaw}" (use 0-100)`,
      );
      return;
    }

    players.push({ name, gender, line: linePos, competitiveness, active: true });
  });

  return { players, errors };
}

function parseCompetitiveness(s: string | undefined): number | null {
  if (s === undefined || s === '') return 0.5;
  const pct = Number(s.replace('%', ''));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct / 100;
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
