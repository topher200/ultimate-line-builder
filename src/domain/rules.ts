import type { MajorityGender, Possession } from './types.ts';

export function oppositeMajority(m: MajorityGender): MajorityGender {
  return m === 'M' ? 'W' : 'M';
}

export function oppositePossession(p: Possession): Possession {
  return p === 'O' ? 'D' : 'O';
}

/**
 * Majority gender for a point, following the repeating ABBA pattern across the
 * whole game. `pointNumber` is the 1-based whole-game point index. Positions 1
 * and 4 of each 4-point cycle use the starting majority; positions 2 and 3 use
 * the opposite. The cycle is continuous: halftime does not restart it.
 */
export function majorityForPoint(
  pointNumber: number,
  startingMajority: MajorityGender,
): MajorityGender {
  const offset = (pointNumber - 1) % 4;
  return offset === 0 || offset === 3
    ? startingMajority
    : oppositeMajority(startingMajority);
}

/**
 * The gender-ratio label for a point, e.g. 'M2'. The letter is the point's
 * majority gender; the digit is which of the pair it is within the ABBA cycle
 * (2 then 1). For an M start the whole-game sequence is M2, W1, W2, M1, M2, ...
 * Overriding a point's majority changes the letter but not the digit (which is
 * fixed by the point's position).
 */
export function pointLabel(
  pointNumber: number,
  majority: MajorityGender,
): string {
  const digit = (pointNumber - 1) % 2 === 0 ? '2' : '1';
  return `${majority}${digit}`;
}

/** Slot counts for a point given its majority gender (mixed 4:3 / 3:4). */
export function slotsForMajority(m: MajorityGender): { MMP: number; WMP: number } {
  return m === 'M' ? { MMP: 4, WMP: 3 } : { MMP: 3, WMP: 4 };
}

/**
 * Possession we play next, before manual overrides.
 * First point of the game uses the declared start. First point of the second
 * half flips it (whoever pulled to open the game receives to open the half).
 * Otherwise: we scored last -> we pull -> D; they scored -> we receive -> O.
 */
export function possessionForPoint(args: {
  isFirstOfGame: boolean;
  isFirstOfHalf2: boolean;
  startingPossession: Possession;
  lastScoredBy: 'us' | 'them' | null;
}): Possession {
  if (args.isFirstOfGame) return args.startingPossession;
  if (args.isFirstOfHalf2) return oppositePossession(args.startingPossession);
  return args.lastScoredBy === 'us' ? 'D' : 'O';
}
