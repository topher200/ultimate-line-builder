import type { Gender, Line } from '../domain/types.ts';

export type GenderView = 'ALL' | Gender;
export type LineView = 'ALL' | Line;

/** Whether a player passes the current gender + line view filters. */
export function matchesView(
  p: { gender: Gender; line: Line },
  gender: GenderView,
  line: LineView,
): boolean {
  return (
    (gender === 'ALL' || p.gender === gender) &&
    (line === 'ALL' || p.line === line)
  );
}
