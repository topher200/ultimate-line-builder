# Ultimate Line Builder

A tablet-first web app for calling lines in mixed Ultimate Frisbee. A captain
or assistant coach uses it on the sideline to decide which 7 players take the
field each point, while the app keeps track of gender ratio, offense/defense,
and everyone's playing time so nobody gets frozen out and the best players play
the biggest points.

> **For agents / new contributors:** this README is the source of truth for the
> domain. Read it fully before touching code. The deep data-model, storage/sync,
> and rotation-engine spec lives in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

---

## 1. The problem

Building a line -- the 7 players on the field for a point -- is hard to do in
your head in the moment. A captain has to juggle:

- **Playing time fairness.** Everyone should get on the field. At a minimum,
  every active player should play at least once per half. You don't want to
  reach the end of the day and discover someone only played 5 points.
- **Playing your best players more.** In competitive points your top players
  should be out there. Example: your best D-line handler should be on the field
  for essentially every competitive D point.
- **Game competitiveness.** An even matchup is fully competitive. A planned
  blowout (16-seed vs 1-seed) or a game where you've fallen behind by 3+ is a
  chance to rest stars and give bench players time. The captain toggles this
  mid-game based on the score.
- **Gender ratio.** Mixed Ultimate alternates the male-matching / woman-matching
  ratio in a fixed pattern (see below). Tracking it and calling a line that
  matches is error-prone.
- **Offense vs defense.** Players are assigned to the O-line or D-line. In
  competitive games the O-line plays offensive points and the D-line plays
  defensive points. Only rarely (a few times a weekend, in non-competitive
  games) do you cross lines to balance playing time.

The app removes this mental load: you tell it the situation, it proposes a
legal, fair, strategy-appropriate line of 7, you tweak if needed, record the
result, and it does it again for the next point.

## 2. How the game works (rules the app encodes)

### Terminology

- **MMP** -- male-matching player. **WMP** -- woman-matching player.
- **O-line / D-line** -- players assigned to play offense / defense.
- **Handler / cutter** -- thrower / receiver roles. **Out of scope for rev 1**
  (the roster is balanced enough that playing-time sliders can "force" handlers
  if ever needed). May be added later.
- **Point** -- one possession sequence ending in a goal. A game is a series of
  points.

### Offense / defense flow

- When **we score**, we pull next point, so we are on **defense**.
- When **they score**, we receive, so we are on **offense**.
- At the **start of the game** the captain declares O or D.
- At **half time**, possession resets: if we **started the game on D**, we start
  the second half on **O** (and vice versa).
- There is always a manual **force O / force D** toggle to override the derived
  possession.

### Gender ratio

Mixed Ultimate alternates between 4:3 and 3:4 MMP:WMP. The majority gender for
each point follows an **ABBA** pattern that repeats across the game:

```
point:   1  2  3  4  5  6  7  8  ...
pattern: A  B  B  A  A  B  B  A  ...
```

If point 1 is MMP-majority (call it "M"), the sequence of majority genders is:

```
M  W  W  M  M  W  W  M ...
```

The app's own shorthand marks each point with the majority gender and whether
it is the 1st or 2nd of its consecutive same-gender pair, e.g. starting on M:

```
M2  W1  W2  M1  M2  ...
```

(The opening point is labelled "2" because the pattern is treated as continuing
into the game.) Starting on W it would be `W2 M1 M2 W1 W2 ...`.

**Half time:** the gender ratio does **not** switch at half. It continues the
same pattern such that the first point of the second half uses the **same
ratio as the first point of the game**. (A 7-5 half = 12 points played; the
4-point pattern realigns, so if the game opened on W2 the second half opens on
W2 again.) The engine computes this deterministically and always allows a manual
per-point override.

### Injury subs

If a player gets hurt mid-point, a replacement comes on and **both** players are
credited with the point. So a recorded point can legitimately list more than 7
players.

### Format

A tournament is usually 2 days, 3 games per day (Saturday sometimes has a 4th).
The app tracks playing time per **game**, per **day**, and per **tournament**.

## 3. Playing-time strategy

Each player has a **competitiveness rating** (0-100%): how much we want them on
the field during competitive points. A star might be 100%, a deep-bench player
10%, and 0% is allowed. The **game-competitiveness** control blends how ratings translate into
targets:

- **Competitive** -- play time roughly proportional to competitiveness rating.
- **Equal** -- everyone finishes the game with roughly even playing time.
- **Non-competitive** -- play your competitive players *very little* to save
  their legs; bench/low-rated players play the most.

The control is continuous and can be changed mid-game. When it changes, the app
re-plans the **remaining** points rather than making a jarring correction: it
projects where each player will end up given the new mode and current counts,
and blends selection accordingly (e.g. favoring under-played players without
suddenly benching everyone who has already played). See
[`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for the exact algorithm.

### Per-player numbers shown

For the current game the app shows, per player:

- **Played** -- points played this game / this day / this tournament.
- **Goal** -- how many points we *want* them to play this game, from their
  rating and the current mode.
- **Predicted** -- how many we *expect* them to play given current game trends.

These are internally consistent: the point pool is `7 x expectedPoints`, and one
player's predicted points are points removed from everyone else's pool. The
expected total points for the game is an editable box (default **20**).

## 4. Screens

| Screen | Audience | Shows ratings? | Purpose |
| --- | --- | --- | --- |
| **Roster** | Head coach | Yes (sensitive) | Manage players: gender, O/D line, competitiveness slider, active toggle. |
| **Game** | Assistant coach | **No** | Live line calling: current line with MMP/WMP marked, +1 Us / +1 Them, force O/D, subs, expected-points box, per-player played/goal/predicted, game-competitiveness slider. |
| **Predictor** | Coach | Yes | Simulate a game assuming O and D points trade; filter O-only / D-only. Later iteration. |
| **Doctor** | Coach | n/a | A panel (on Roster) flagging misconfiguration: not enough MMPs/WMPs for a legal line, impossible to guarantee everyone a point, etc. |

The **competitiveness rating is sensitive** (players may see the tablet) and
must never appear on the Game screen. The **game-competitiveness** slider is
*not* sensitive (it's about the game, not a person) and lives on the Game screen
for in-the-moment adjustment.

Every player has an **Active** toggle (default on). Toggling off (e.g. injury)
removes them from rotation until toggled back on.

## 5. Architecture

Four layers, cleanly separated:

1. **Domain core** (`src/domain/`) -- pure TypeScript, no React. Types, the
   event-fold that derives state, the gender-ratio and possession rules, target
   computation, the line-suggestion engine, prediction, and the doctor. Every
   rule is a pure function with exhaustive Vitest coverage. This is the most
   important and most-tested part of the codebase.
2. **Persistence** (`src/persistence/`) -- a `Repository` interface with a
   localStorage implementation for rev 1 and a Supabase implementation later,
   plus the log-merge (sync reconciliation) module.
3. **Store** (`src/store/`) -- Zustand, holding the event log + roster, exposing
   derived selectors and action dispatchers that append events and persist.
4. **UI** (`src/screens/`, `src/components/`) -- React + Tailwind, tablet-first.

### Data model in one paragraph

A **game is an append-only log of immutable events**; all on-screen numbers are
*derived* by folding the log, never stored. The **roster is a separate mutable
document** (last-write-wins per player). Offline-first: events append locally
with no server. Sync reconciles divergent logs by **longest chain wins** (if one
log is a prefix of the other, keep the longer; if they truly diverged, keep the
one with more points and archive the loser so nothing is lost). Full spec,
including the event types, the rotation algorithm, and the merge rules, is in
[`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## 6. Build & run

```bash
npm install
npm run dev        # Vite dev server (host:true, so reachable from the tablet on your LAN)
npm run test       # Vitest (domain core)
npm run typecheck  # tsc, no emit
npm run build      # production PWA build -> dist/
npm run preview    # serve the production build locally
```

- **Stack:** React + TypeScript + Vite, installable PWA (vite-plugin-pwa),
  Zustand, Tailwind CSS v4, React Router, Vitest.
- **Local persistence:** localStorage (rev 1), behind the `Repository` interface
  in `src/persistence/`.
- **Cloud (later):** Supabase (Postgres) storing per-game event logs, with
  client-side longest-chain merge on reconnect.

### Deploy (Netlify)

`netlify.toml` is committed: build command `npm run build`, publish dir `dist`,
with an SPA redirect so React Router routes resolve. Point a Netlify site at the
repo (or `netlify deploy`) and it builds on push. HTTPS is automatic, which the
PWA needs for install + offline. Testing PWA install locally requires
`npm run build && npm run preview` (the service worker is production-only).

### Source layout

```
src/
  domain/        pure TS, no React, fully unit-tested (35 tests):
                   types, rules (ABBA/possession), fold (deriveState),
                   engine (targets/selectLine/predictGame), aggregate, doctor
  persistence/   Repository interface + LocalRepository
  store/         Zustand store: event log + roster + all actions
  screens/       Roster, Game, Predictor (all built)
docs/DATA_MODEL.md   deep spec: events, fold, sync merge, rotation engine
```

