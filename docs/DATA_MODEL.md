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

interface Tournament {
  id: Id;
  name: string;
  createdAt: number;
  updatedAt?: number;                   // last-write-wins clock
  deletedAt?: number;                   // soft-delete tombstone; set = deleted
}

interface GameMeta {
  gameId: Id;
  name: string;
  createdAt: number;
  tournamentId: Id;                     // the tournament this game belongs to
  ourTeam: string;
  theirTeam: string;
  updatedAt?: number;                   // last-write-wins clock
  deletedAt?: number;                   // soft-delete tombstone; set = deleted
}
```

Games are grouped under **tournaments**. Both are plain rows (not event logs):
they sync by last-write-wins on `updatedAt`, and delete via a `deletedAt`
tombstone rather than row removal, so a deletion propagates through the
add-only merge instead of being resurrected (see section 7). Deleting a
tournament tombstones its games too.

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
  | { kind: 'StartConfigChanged';
      startingPossession?: Possession;   // correct what the game started on
      startingMajority?: MajorityGender; }
  | { kind: 'PossessionOverridden'; value: Possession }   // next point only
  | { kind: 'MajorityOverridden'; value: MajorityGender }  // next point only
  | { kind: 'HalfStarted' }            // marks the second-half boundary
  | { kind: 'Undone'; targetId: Id };  // compensating event (point or half start)

interface LineupEntry {
  playerId: Id;
  injurySubFor?: Id;    // present when this player came on for an injured one;
                        // both the injured player and the sub are credited
}
```

Notes:

- **Undo** appends `Undone` referencing the target event's id rather than
  mutating history. The fold skips the undone point or half start. (Simplest
  robust approach for sync; the log stays append-only.)
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
Merge policy: **whole-document last-write-wins**, keyed on the document
`updatedAt`. On reconcile each device adopts whichever roster doc is newer, so
player adds, edits, and deletions all propagate as a unit (a deleted player is
simply absent from the newer doc). Roster edits are rare and almost never
concurrent, so document-level LWW is sufficient and far simpler than merging
into the event log; the tradeoff is that truly concurrent edits on two devices
resolve to one device's whole doc rather than being field-merged.

## 6. Persistence

```ts
interface Repository {
  loadRoster(): Promise<Roster | null>;
  saveRoster(r: Roster): Promise<void>;
  listTournaments(): Promise<Tournament[]>;
  saveTournaments(ts: Tournament[]): Promise<void>;
  listGames(): Promise<GameMeta[]>;
  saveGames(games: GameMeta[]): Promise<void>;
  loadLog(gameId: Id): Promise<EventEnvelope[]>;
  saveLog(gameId: Id, events: EventEnvelope[]): Promise<void>;
  appendEvent(e: EventEnvelope): Promise<void>;
}
```

Tournament and game rows carry `updatedAt`/`deletedAt` for merge; deletes are
tombstones (a save with `deletedAt` set), never row removal, so `saveGames` /
`saveTournaments` also serve as the delete path.

- **Rev 1: `LocalRepository`** -- serializes the roster, tournament list, game
  list, and each game log to `localStorage` as JSON. A weekend is a few hundred
  events, so size is a non-issue. Keep everything behind this interface so the
  storage engine can be swapped without touching the store or UI.
- **`SupabaseRepository`** -- a durable cloud mirror behind the same interface
  (see `db/schema.sql`). Postgres tables:
  - `events(id pk, game_id, seq, parent_id, device_id, ts, payload jsonb)`.
  - `rosters(id, doc jsonb, updated_at)`.
  - `tournaments(id pk, name, created_at, updated_at, deleted_at)`.
  - `games(game_id pk, name, created_at, tournament_id, our_team, their_team,
    updated_at, deleted_at)`.
  RLS grants the anon (publishable) key full access, gated to a single private
  team. Local stays the source of truth; the mirror is best-effort.

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

### Non-log data (roster, tournaments, games)

The longest-chain merge is only for event logs. The mutable rows sync more
simply, and all three reconcile triggers run the same pass (startup, `online`,
and tab `visibilitychange`):

- **Roster**: whole-document LWW on `updatedAt` (section 5). The newer doc wins
  wholesale; a local doc that's newer than the mirror is re-pushed to catch up
  failed offline writes.
- **Tournaments & games**: merged by id. Field values follow LWW on `updatedAt`
  (local wins ties, since the live tablet is authoritative), and `deletedAt` is
  **sticky** -- a tombstone from either side survives a later edit on the other,
  so a delete is never resurrected. This matters because the merge is otherwise
  add-only (union of both sides); without a syncing tombstone, a row deleted on
  one device would reappear from another's copy. Backfill that synthesizes a
  tournament for an orphan game ignores tombstoned games for the same reason.

## 8. Rotation engine

Pure functions in `src/domain/`. Given the derived `GameState`, the roster, and
the current point context, produce a suggested line of 7.

### One line per point (never a mix)

A point is played entirely by one line: an O point by the O line, a D point by
the D line. The engine **never** suggests a mixed line drawing from both. Each
player only ever plays with their own line's players. The coach can manually
**call the other whole line** for a point (most often the D line onto an offense
point) with the **Play this line** button; the engine then suggests that line's
players. It never proposes the cross-line call itself, and if a fielded line is
short a gender it flags the shortfall rather than borrowing from the other line.

Mode never crosses lines. It only changes the *weighting within* a line's pool.

### 8.1 Targets (line-scoped, going-forward)

Because players only play their own line, goals are scoped per **(line, gender)**
pool over that line's share of the game. Weight blends the rating by mode:

```
w_competitive(p) = p.competitiveness
w_equal(p)       = 1
w_noncomp(p)     = 1 - p.competitiveness
weight(p, mode)  = blend(mode, w_competitive, w_equal, w_noncomp)  // piecewise lerp
```

The mode slider means **going forward**, not end-of-game. Changing the mode
re-plans only the points remaining from that moment, keeping the head start each
player already earned. The baseline (points played, and per-player counts, at
the last mode change) is *derived* from the log position of the latest
`ModeChanged` -- no snapshot is stored in the event, so undo and log-merge stay
correct for free. With the default start-of-game baseline this is a plain
whole-game goal.

```
remaining          = max(0, expectedPoints - baseline.totalPoints)
linePoints         = expectedPoints * lineShare        // points this line plays (O or D share)
remainingSlots(g)  = avgSlotsPerPoint(gender) * remaining * lineShare
target(p) = min(linePoints,
                baseline.played[p] + remainingSlots * weight(p) / sum(weight over pool))
```

The cap is `linePoints`, not the whole game: a player only ever plays their own
line's points, so a heavily-weighted star's goal can't exceed how many points
that line plays (capping at `expectedPoints` would hand out goals no one on that
line could reach).

`target(p)` is the player's **Goal**. The deficit then collapses to "your share
of the remaining pool minus what you've played since the slider moved," so right
after a switch every player has a positive deficit (nobody is retroactively
benched to equalize final totals).

### 8.2 Per-point selection

Only the fielded line's players are eligible; within each gender slot (4/3 per
the majority) we take the players furthest behind their target.

```
eligible = active players on the fielded line, of the required gender
priority(p) = target(p) - played_this_game(p)     // "deficit": how owed a point
            + urgencyBoost(p)                      // once-per-half constraint
fill each gender slot with the highest-priority eligible players;
flag `short` if the line cannot fill a slot (no cross-line backfill)
```

`urgencyBoost` ramps as the half runs out: any active player with 0 points this
half gets an escalating boost so the "everyone plays once per half" rule is met
before the half ends. If it is mathematically impossible (too many players for
the points remaining), the **Doctor** flags it rather than the engine failing
silently.

The engine returns the 7 chosen players **plus a short explanation** per pick
("owed a point", "needs a half point") so the coach trusts the suggestion and
can edit with context. Edits (swap a player, add an injury sub) adjust the
proposed lineup before it is confirmed into a `PointCompleted` event.

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
