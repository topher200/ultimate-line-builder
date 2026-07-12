-- Ultimate Line Builder -- Supabase schema.
-- Run in the Supabase SQL editor (or psql) once to provision the project.
-- Data volume is tiny (a weekend is a few hundred events); this is just a
-- durable mirror of the localStorage event log, reconciled by longest-chain
-- merge on the client (see src/domain/merge.ts).

create table if not exists rosters (
  id text primary key,          -- single shared team roster: 'team'
  doc jsonb not null,
  updated_at bigint not null
);

create table if not exists tournaments (
  id text primary key,
  name text not null,
  created_at bigint not null,
  updated_at bigint,           -- last-write-wins clock for cross-device edits
  deleted_at bigint            -- soft-delete tombstone; null = live
);

create table if not exists games (
  game_id text primary key,
  name text not null,
  created_at bigint not null,
  tournament_id text not null,
  our_team text not null default 'Rampage',
  their_team text not null default 'Opponent',
  updated_at bigint,           -- last-write-wins clock for cross-device edits
  deleted_at bigint            -- soft-delete tombstone; null = live
);

-- Backfill for projects provisioned before team names existed.
alter table games add column if not exists our_team text not null default 'Rampage';
alter table games add column if not exists their_team text not null default 'Opponent';

-- Backfill for projects provisioned before last-write-wins + soft-delete existed.
alter table tournaments add column if not exists updated_at bigint;
alter table tournaments add column if not exists deleted_at bigint;
alter table games add column if not exists updated_at bigint;
alter table games add column if not exists deleted_at bigint;

create table if not exists events (
  id text primary key,          -- event uuid, stable across devices
  game_id text not null,
  seq integer not null,
  parent_id text,
  device_id text not null,
  ts bigint not null,
  payload jsonb not null
);

create index if not exists events_game_seq_idx on events (game_id, seq);

-- Row level security. Policies below grant the anon (publishable-key) role full
-- access, which is the simplest setup for a single private team. NOTE: this
-- means anyone who has the project URL and the publishable key can read/write
-- these tables. That is usually fine for a hobby team app, but if you want it
-- locked down, replace these with Supabase Auth + a per-team check, or gate on
-- a shared secret. The SECRET key must never be shipped in the web client.

alter table rosters enable row level security;
alter table tournaments enable row level security;
alter table games enable row level security;
alter table events enable row level security;

drop policy if exists "anon rosters" on rosters;
drop policy if exists "anon tournaments" on tournaments;
drop policy if exists "anon games" on games;
drop policy if exists "anon events" on events;

create policy "anon rosters" on rosters for all to anon using (true) with check (true);
create policy "anon tournaments" on tournaments for all to anon using (true) with check (true);
create policy "anon games" on games for all to anon using (true) with check (true);
create policy "anon events" on events for all to anon using (true) with check (true);
