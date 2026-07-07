# Data Model, Storage, Sync & Rotation Engine

Deep spec for the parts that were called out as the important, hard-to-reverse
decisions. Read [`../README.md`](../README.md) first for the domain rules this
builds on.

---

## 1. Guiding principles

1. **Derive, don't store.** Point counts, current possession, gender ratio,
   goals, and predictions are all *computed* from the event log + roster. The
   only persisted truths are (a) the event log per game and (b) the roster
   document. This makes predicted-vs-actual impossible to desync and makes undo
   trivial.
2. **Offline-first.** Every action works with no network. The network is a
   background sync, never a dependency.
3. **Boring beats clever.** During a live game one tablet is the source of
   truth, so we resolve sync conflicts with a hand-rolled longest-chain merge
   rather than a CRDT framework. Revisit only if concurrent multi-tablet editing
   becomes real.

## 2. Core types

```ts
type Id = string;                       // uuid v4
type Gender = 'MMP' | 'WMP';
type Line = 'O' | 'D';                  // player's assigned line
type Possession = 'O' | 'D';            // who we are this point
type MajorityGender = 'M' | 'W';        // 4-of-this-gender that point

interface Player {
  id: Id;
  name: string;
  gender: Gender;
  line: Line;
  competitiveness: number;              // 0..1, sensitive; head-coach only
  active: boolean;                      // false = injured/unavailable
}

interface Roster {
  players: Player[];
  updatedAt: number;                    // for last-write-wins merge
  updatedBy: DeviceId;
}
```

### Competitiveness mode

A single continuous control, `mode ∈ [0, 1]`:

- `0.0` = **fully competitive** (target ∝ competitiveness rating)
- `0.5` = **equal** (target uniform across active players)
- `1.0` = **non-competitive** (target ∝ inverse of rating; rest the stars)

Values in between linearly blend the two nearest anchors.

## 3. Event log

Each **game** owns an ordered, append-only array of events. An event is
immutable once appended. State is `fold(events, roster)`.

```ts
interface EventEnvelope<T = EventPayload> {
  id: Id;                 // uuid, stable across devices once created
  gameId: Id;
  seq: number;            // 0-based position in this device's view of the log
  parentId: Id | null;    // id of the previous event (forms the chain)
  deviceId: DeviceId;
  ts: number;             // wall clock, tie-breaker only
  payload: T;
}

type EventPayload =
  | { kind: 'GameStarted';
      startingPossession: Possession;
      startingMajority: MajorityGender;
      expectedPoints: number;          // default 20
      mode: number; }                  // competitiveness mode 0..1
  | { kind: 'PointCompleted';
      lineup: LineupEntry[];           // may be >7 due to injury subs
      possession: Possession;          // possession actually played
      majority: MajorityGender;        // ratio actually played
      scoredBy: 'us' | 'them'; }
  | { kind: 'ExpectedPointsChanged'; value: number }
  | { kind: 'ModeChanged'; value: number }
  | { kind: 'PossessionOverridden'; value: Possession }   // next point only
  | { kind: 'MajorityOverridden'; value: MajorityGender }  // next point only
  | { kind: 'HalfStarted' }            // marks the second-half boundary
  | { kind: 'PointUndone'; targetId: Id };  // compensating event

interface LineupEntry {
  playerId: Id;
  injurySubFor?: Id;    // present when this player came on for an injured one;
                        // both the injured player and the sub are credited
}
```

Notes:

- **Undo** appends `PointUndone` referencing the point's event id rather than
  mutating history. The fold skips undone points. (Simplest robust approach for
  sync; the log stays append-only.)
- Roster edits are **not** events -- they live in the roster document (section 5).
- Ephemeral UI state (the proposed-but-unconfirmed line, slider being dragged)
  is never an event. Only a *confirmed* point becomes `PointCompleted`.

## 4. Derived state (the fold)

```ts
interface GameState {
  events: EventEnvelope[];
  config: { expectedPoints: number; mode: number };
  // current point context
  nextPossession: Possession;          // from last result + halftime + overrides
  nextMajority: MajorityGender;         // from ABBA pattern + overrides
  half: 1 | 2;
  score: { us: number; them: number };
  pointIndexInHalf: number;            // 0-based, for the ABBA pattern
  // per-player tallies (game scope; day/tournament aggregate across games)
  played: Record<Id, number>;
}
```

### Possession rule

```
pointForNext =
  if a PossessionOverridden is pending -> that value
  else if this is the first point of the game -> GameStarted.startingPossession
  else if this is the first point of the second half ->
        opposite of GameStarted.startingPossession
  else if last point scoredBy 'us' -> 'D'      // we pull
  else                             -> 'O'      // we receive
```

### Gender-ratio rule

The majority gender is a pure function of the point index within the half and
the game's starting majority. The pattern is ABBA repeating, i.e. position `p`
(1-based) within the half:

```
patternOffset(p) = ((p - 1) mod 4)      // 0->A, 1->B, 2->B, 3->A
majority(p, start) = (patternOffset(p) in {0,3}) ? start : opposite(start)
```

Because the second half restarts `p` at 1, the second half opens on the same
majority as the game's first point (matches the README's half-time rule). A
pending `MajorityOverridden` wins over the computed value for that one point.

## 5. Roster document

The roster is mutable current-state, stored separately from any game log.
Merge policy: **last-write-wins per player**, keyed on a per-player `updatedAt`.
(A whole-document `updatedAt` is kept too, for cheap "which is newer" checks.)
Roster edits are rare and almost never concurrent, so LWW is sufficient and far
simpler than merging into the event log.

## 6. Persistence

```ts
interface Repository {
  loadRoster(): Promise<Roster | null>;
  saveRoster(r: Roster): Promise<void>;
  listGames(): Promise<GameMeta[]>;
  loadLog(gameId: Id): Promise<EventEnvelope[]>;
  appendEvent(e: EventEnvelope): Promise<void>;
  // sync (no-op in the local-only implementation)
  pushPending?(): Promise<void>;
  pull?(): Promise<void>;
}
```

- **Rev 1: `LocalRepository`** -- serializes the roster and each game log to
  `localStorage` as JSON. A weekend is a few hundred events, so size is a
  non-issue. Keep everything behind this interface so the storage engine can be
  swapped without touching the store or UI.
- **Later: `SupabaseRepository`** -- Postgres tables:
  - `events(game_id, seq, id, parent_id, device_id, ts, payload jsonb)`,
    primary key `(game_id, device_id, seq)`.
  - `rosters(id, doc jsonb, updated_at)`.
  Auth can be a single shared team login (magic link) for rev 1.1; no per-user
  accounts needed.

## 7. Sync & conflict reconciliation ("longest chain wins")

One game's log lives on possibly several devices. On reconnect we reconcile.

```
mergeLogs(a, b):
  find the longest common prefix (by event id) of a and b
  if one is a prefix of the other        -> keep the longer   (fast path, common)
  else (they diverged after the prefix)  -> winner = the branch with more
                                            PointCompleted events
                                            (tie-break: later max ts, then
                                             lexicographically larger deviceId)
  archive the losing branch's tail under the game so nothing is lost and it can
  be inspected/recovered later.
```

Rationale: during a live game a single tablet records every point, so logs
almost always sit in the prefix fast path. True divergence only happens if two
tablets independently ran (part of) the same game -- rare, and "the tablet that
recorded more points is the real one" is the intuitive resolution. We never
*delete* a losing branch; we set it aside.

Each device has a stable `deviceId` (uuid in localStorage) used for tie-breaking
and for the `events` primary key.

## 8. Rotation engine

Pure functions in `src/domain/`. Given the derived `GameState`, the roster, and
the current point context, produce a suggested line of 7.

### 8.1 Targets

The point pool has `7 x expectedPoints` player-slots. Give each active player a
weight from their rating blended by the mode:

```
w_competitive(p) = p.competitiveness
w_equal(p)       = 1
w_noncomp(p)     = 1 - p.competitiveness
weight(p, mode)  = blend(mode, w_competitive, w_equal, w_noncomp)  // piecewise lerp
target(p) = expectedPoints * weight(p) / sum(weight over active players)
```

`target(p)` is the player's **Goal** for the game. Targets are always computed
for the *whole* game, which is what makes a mid-game mode change smooth: only
the remaining points get re-planned, via the deficit below.

### 8.2 Per-point selection

For the current point we need slots by gender (4/3 per the majority) and, in
competitive contexts, by line (O players for O points, D players for D points).

```
eligible = active players of the required gender
           preferring the matching line; in equal/non-comp mode, cross-line
           is allowed to balance time (rare, per the rules)
priority(p) = target(p) - played_this_game(p)     // "deficit": how owed a point
            + urgencyBoost(p)                      // once-per-half constraint
fill each gender slot with the highest-priority eligible players
```

`urgencyBoost` ramps as the half runs out: any active player with 0 points this
half gets an escalating boost so the "everyone plays once per half" rule is met
before the half ends. If it is mathematically impossible (too many players for
the points remaining), the **Doctor** flags it rather than the engine failing
silently.

The engine returns the 7 chosen players **plus a short explanation** per pick
(e.g. "owed a point", "best D handler", "needs a half point") so the coach
trusts the suggestion and can edit with context. Edits (swap a player, add an
injury sub) adjust the proposed lineup before it is confirmed into a
`PointCompleted` event.

### 8.3 Prediction

**Predicted** points per player = run the same selection policy forward over the
remaining expected points, assuming O and D points trade, and count how many
each player accrues. The Predictor screen runs the identical simulation from an
empty game. Because prediction and live selection share one function, the
"predicted removes from everyone else's pool" consistency is automatic.

## 9. The Doctor

Pure validation over roster + config, surfaced as warnings on the Roster screen:

- Fewer than 4 active MMPs or 4 active WMPs (can't field some legal ratios).
- Fewer than 7 active players.
- More players than can each get a half point given `expectedPoints`.
- A line (O or D) with too few active players of a needed gender to cover its
  competitive points.
- Everyone on one line, or lopsided O/D splits that force cross-line play.

## 10. Testing

The domain core is where correctness lives, so it carries the test weight:

- ABBA majority pattern across a full game including the half-time boundary and
  overrides.
- Possession derivation incl. first point, halftime flip, and force toggles.
- Target math for competitive / equal / non-competitive and blends.
- Selection honoring gender counts, line preference, deficits, and the
  once-per-half urgency.
- Fold correctness incl. undo and injury subs (>7 players credited).
- `mergeLogs`: prefix fast path, divergence, tie-breaks, loser archived.
