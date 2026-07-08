import { describe, expect, it } from 'vitest';
import { playedPoints } from './history.ts';
import type { EventEnvelope, EventPayload } from './types.ts';

function envelope(id: string, payload: EventPayload): EventEnvelope {
  return { id, gameId: 'g', seq: 0, parentId: null, deviceId: 'd', ts: 0, payload };
}

function point(id: string, scoredBy: 'us' | 'them', players: string[]): EventEnvelope {
  return envelope(id, {
    kind: 'PointCompleted',
    lineup: players.map((playerId) => ({ playerId })),
    possession: 'O',
    majority: 'M',
    scoredBy,
  });
}

function undo(targetId: string): EventEnvelope {
  return envelope(`u-${targetId}`, { kind: 'PointUndone', targetId });
}

describe('playedPoints', () => {
  it('lists completed points in order with a running score', () => {
    const pts = playedPoints([
      point('a', 'us', ['p1']),
      point('b', 'them', ['p2']),
      point('c', 'us', ['p1']),
    ]);
    expect(pts.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(pts.map((p) => p.scoredBy)).toEqual(['us', 'them', 'us']);
    expect(pts.at(-1)!.scoreAfter).toEqual({ us: 2, them: 1 });
  });

  it('skips undone points and re-indexes the rest', () => {
    const pts = playedPoints([
      point('a', 'us', ['p1']),
      point('b', 'them', ['p2']),
      undo('b'),
      point('c', 'us', ['p1']),
    ]);
    expect(pts.map((p) => p.eventId)).toEqual(['a', 'c']);
    expect(pts.map((p) => p.index)).toEqual([1, 2]);
    expect(pts.at(-1)!.scoreAfter).toEqual({ us: 2, them: 0 });
  });
});
