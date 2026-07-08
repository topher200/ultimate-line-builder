import { describe, expect, it } from 'vitest';
import {
  majorityForPoint,
  pointLabel,
  possessionForPoint,
  slotsForMajority,
} from './rules.ts';

describe('majorityForPoint (ABBA)', () => {
  it('follows A B B A A B B A starting on M', () => {
    const seq = [1, 2, 3, 4, 5, 6, 7, 8].map((p) => majorityForPoint(p, 'M'));
    expect(seq).toEqual(['M', 'W', 'W', 'M', 'M', 'W', 'W', 'M']);
  });

  it('follows the mirror sequence starting on W', () => {
    const seq = [1, 2, 3, 4, 5].map((p) => majorityForPoint(p, 'W'));
    expect(seq).toEqual(['W', 'M', 'M', 'W', 'W']);
  });

  it('keys off the whole-game point number, so halftime does not restart it', () => {
    // Point 1 opens on the starting majority; the cycle then runs unbroken
    // regardless of where halftime falls.
    expect(majorityForPoint(1, 'W')).toBe('W');
    expect(majorityForPoint(5, 'W')).toBe('W');
  });
});

describe('pointLabel', () => {
  it('labels the M-start cycle M2, W1, W2, M1, M2', () => {
    const seq = [1, 2, 3, 4, 5].map((p) => pointLabel(p, majorityForPoint(p, 'M')));
    expect(seq).toEqual(['M2', 'W1', 'W2', 'M1', 'M2']);
  });

  it('reflects an overridden majority in the letter, keeping the position digit', () => {
    // Position 2 is normally W1; overriding the majority to M yields M1.
    expect(pointLabel(2, 'M')).toBe('M1');
  });
});

describe('slotsForMajority', () => {
  it('gives 4:3 on M and 3:4 on W', () => {
    expect(slotsForMajority('M')).toEqual({ MMP: 4, WMP: 3 });
    expect(slotsForMajority('W')).toEqual({ MMP: 3, WMP: 4 });
  });
});

describe('possessionForPoint', () => {
  const base = {
    isFirstOfGame: false,
    isFirstOfHalf2: false,
    startingPossession: 'D' as const,
    lastScoredBy: null,
  };

  it('uses the declared start on the first point', () => {
    expect(possessionForPoint({ ...base, isFirstOfGame: true })).toBe('D');
  });

  it('flips the start to open the second half', () => {
    expect(possessionForPoint({ ...base, isFirstOfHalf2: true })).toBe('O');
  });

  it('goes to D after we score and O after they score', () => {
    expect(possessionForPoint({ ...base, lastScoredBy: 'us' })).toBe('D');
    expect(possessionForPoint({ ...base, lastScoredBy: 'them' })).toBe('O');
  });
});
