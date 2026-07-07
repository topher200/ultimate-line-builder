import type { Player } from './types.ts';

export type WarningLevel = 'error' | 'warning';

export interface DoctorWarning {
  level: WarningLevel;
  message: string;
}

/**
 * Validate the roster + game config, surfacing anything that would make legal,
 * fair lines impossible. Errors block a legal line; warnings are advisory.
 */
export function runDoctor(
  players: Player[],
  expectedPoints: number,
): DoctorWarning[] {
  const warnings: DoctorWarning[] = [];
  const active = players.filter((p) => p.active);
  const mmp = active.filter((p) => p.gender === 'MMP');
  const wmp = active.filter((p) => p.gender === 'WMP');

  if (active.length < 7) {
    warnings.push({
      level: 'error',
      message: `Only ${active.length} active players; a line needs 7.`,
    });
  }
  if (mmp.length < 4) {
    warnings.push({
      level: 'error',
      message: `Only ${mmp.length} active MMPs; a 4:3 point needs 4.`,
    });
  }
  if (wmp.length < 4) {
    warnings.push({
      level: 'error',
      message: `Only ${wmp.length} active WMPs; a 3:4 point needs 4.`,
    });
  }

  // Everyone should get at least one point per half. A half is ~expectedPoints/2
  // points x 7 slots; if there are more active players than slots, someone sits.
  const halfSlots = Math.ceil(expectedPoints / 2) * 7;
  if (active.length > halfSlots) {
    warnings.push({
      level: 'warning',
      message: `${active.length} active players but only ~${halfSlots} slots per half; not everyone can play each half.`,
    });
  }

  for (const line of ['O', 'D'] as const) {
    for (const gender of ['MMP', 'WMP'] as const) {
      const need = gender === 'MMP' ? 4 : 4;
      const count = active.filter(
        (p) => p.line === line && p.gender === gender,
      ).length;
      if (count < need && active.length >= 7) {
        warnings.push({
          level: 'warning',
          message: `${line}-line has ${count} active ${gender}s; competitive points may force cross-line play.`,
        });
      }
    }
  }

  return warnings;
}
