import type { MajorityGender, Possession } from './types.ts';

export function oppositeMajority(m: MajorityGender): MajorityGender {
  return m === 'M' ? 'W' : 'M';
}

export function oppositePossession(p: Possession): Possession {
  return p === 'O' ? 'D' : 'O';
}

/**
 * Majority gender for a point, following the repeating ABBA pattern.
 * `pointInHalf` is 1-based. Position 1 and 4 of each 4-point cycle use the
 * starting majority; positions 2 and 3 use the opposite. Since the second half
 * restarts the count at 1, it opens on the same majority as the game's start.
 */
export function majorityForPoint(
  pointInHalf: number,
  startingMajority: MajorityGender,
): MajorityGender {
  const offset = (pointInHalf - 1) % 4;
  return offset === 0 || offset === 3
    ? startingMajority
    : oppositeMajority(startingMajority);
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
