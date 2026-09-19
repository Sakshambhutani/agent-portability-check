-- Agent Portability Check: identified result + team comparison layer
-- Anonymous scans do not write here. These tables are only used after explicit sign-in.

create extension if not exists pgcrypto;

create table if not exists public.apc_teams (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique check (char_length(invite_code) between 8 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.apc_team_members (
  team_id uuid not null references public.apc_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  email text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.apc_saved_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.apc_teams(id) on delete set null,
  referral_id text,
  target text check (target in ('claude','codex','cursor') or target is null),
  runtime text not null default 'local' check (runtime in ('local','cloud')),
  target_ready integer not null default 0 check (target_ready >= 0),
  target_total integer not null default 0 check (target_total >= 0),
  target_auto integer not null default 0 check (target_auto >= 0),
  target_manual integer not null default 0 check (target_manual >= 0),
  target_context integer not null default 0 check (target_context >= 0),
  target_deps integer not null default 0 check (target_deps >= 0),
  portable_ready integer not null default 0 check (portable_ready >= 0),
  total_skills integer not null default 0 check (total_skills >= 0),
  drift integer not null default 0 check (drift >= 0),
  complete boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists apc_results_user_created_idx
  on public.apc_saved_results(user_id, created_at desc);

create index if not exists apc_results_team_created_idx
  on public.apc_saved_results(team_id, created_at desc);

create index if not exists apc_members_user_idx
  on public.apc_team_members(user_id);

alter table public.apc_teams enable row level security;
alter table public.apc_team_members enable row level security;
alter table public.apc_saved_results enable row level security;

-- Browser clients may only read/write their own identified rows if direct client
-- access is ever enabled. The Vercel API uses the server-side service role.
drop policy if exists "apc own results" on public.apc_saved_results;
create policy "apc own results"
  on public.apc_saved_results
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "apc own memberships" on public.apc_team_members;
create policy "apc own memberships"
  on public.apc_team_members
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "apc owned teams" on public.apc_teams;
create policy "apc owned teams"
  on public.apc_teams
  for select
  to authenticated
  using (owner_user_id = auth.uid());
