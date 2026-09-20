-- Agent Portability Check: identified result + team comparison layer
-- Anonymous scanning remains local/account-free. These objects are used only
-- after explicit sign-in, except the sanitized capability-link snapshot RPC.

create extension if not exists pgcrypto;

create table if not exists public.apc_teams (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique check (char_length(invite_code) between 8 and 40),
  target text check (target in ('claude','codex','cursor') or target is null),
  runtime text not null default 'local' check (runtime in ('local','cloud')),
  created_at timestamptz not null default now()
);

create table if not exists public.apc_team_members (
  team_id uuid not null references public.apc_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  email text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.apc_saved_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.apc_teams(id) on delete set null,
  referral_id text check (referral_id is null or char_length(referral_id) <= 40),
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
  created_at timestamptz not null default now(),
  check (target_ready <= target_total),
  check (portable_ready <= total_skills)
);

create index if not exists apc_results_user_created_idx
  on public.apc_saved_results(user_id, created_at desc);
create index if not exists apc_results_team_created_idx
  on public.apc_saved_results(team_id, created_at desc);
create index if not exists apc_members_user_idx
  on public.apc_team_members(user_id);
create index if not exists apc_teams_owner_user_idx
  on public.apc_teams(owner_user_id);

alter table public.apc_teams enable row level security;
alter table public.apc_team_members enable row level security;
alter table public.apc_saved_results enable row level security;

-- Direct table access has no policies. Access is deliberately concentrated in
-- the narrowly scoped RPCs below.

create or replace function public.apc_create_team(
  p_name text,
  p_target text default null,
  p_runtime text default 'local',
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.apc_teams%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_target is not null and p_target not in ('claude','codex','cursor') then
    raise exception 'invalid_target';
  end if;
  if p_runtime not in ('local','cloud') then
    raise exception 'invalid_runtime';
  end if;

  v_code := translate(trim(trailing '=' from encode(gen_random_bytes(9), 'base64')), '+/', '-_');

  insert into public.apc_teams(owner_user_id, name, invite_code, target, runtime)
  values (
    v_uid,
    left(coalesce(nullif(trim(p_name), ''), 'My Agent Team'), 80),
    v_code,
    p_target,
    p_runtime
  )
  returning * into v_team;

  insert into public.apc_team_members(team_id, user_id, display_name, email)
  values (
    v_team.id,
    v_uid,
    nullif(left(trim(coalesce(p_display_name,'')),80),''),
    auth.jwt()->>'email'
  )
  on conflict (team_id, user_id) do nothing;

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'invite_code', v_team.invite_code,
    'target', v_team.target,
    'runtime', v_team.runtime,
    'created_at', v_team.created_at
  );
end;
$$;

create or replace function public.apc_join_team(
  p_code text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.apc_teams%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_team
  from public.apc_teams
  where invite_code = p_code
  limit 1;

  if v_team.id is null then raise exception 'team_not_found'; end if;

  insert into public.apc_team_members(team_id, user_id, display_name, email)
  values (
    v_team.id,
    v_uid,
    nullif(left(trim(coalesce(p_display_name,'')),80),''),
    auth.jwt()->>'email'
  )
  on conflict (team_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.apc_team_members.display_name),
        email = coalesce(excluded.email, public.apc_team_members.email);

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'invite_code', v_team.invite_code,
    'target', v_team.target,
    'runtime', v_team.runtime
  );
end;
$$;

create or replace function public.apc_save_result(
  p_team_code text default null,
  p_referral_id text default null,
  p_target text default null,
  p_runtime text default 'local',
  p_target_ready integer default 0,
  p_target_total integer default 0,
  p_target_auto integer default 0,
  p_target_manual integer default 0,
  p_target_context integer default 0,
  p_target_deps integer default 0,
  p_portable_ready integer default 0,
  p_total_skills integer default 0,
  p_drift integer default 0,
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.apc_teams%rowtype;
  v_result public.apc_saved_results%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_target is not null and p_target not in ('claude','codex','cursor') then
    raise exception 'invalid_target';
  end if;
  if p_runtime not in ('local','cloud') then
    raise exception 'invalid_runtime';
  end if;

  if p_team_code is not null and length(trim(p_team_code)) > 0 then
    select * into v_team
    from public.apc_teams
    where invite_code = p_team_code
    limit 1;

    if v_team.id is null then raise exception 'team_not_found'; end if;

    if not exists (
      select 1 from public.apc_team_members
      where team_id = v_team.id and user_id = v_uid
    ) then
      raise exception 'join_team_first';
    end if;

    if v_team.target is distinct from p_target or v_team.runtime is distinct from p_runtime then
      raise exception 'team_target_mismatch';
    end if;
  end if;

  insert into public.apc_saved_results(
    user_id, team_id, referral_id, target, runtime,
    target_ready, target_total, target_auto, target_manual,
    target_context, target_deps, portable_ready, total_skills,
    drift, complete
  )
  values (
    v_uid,
    v_team.id,
    nullif(left(trim(coalesce(p_referral_id,'')),40),''),
    p_target,
    p_runtime,
    greatest(p_target_ready,0),
    greatest(p_target_total,0),
    greatest(p_target_auto,0),
    greatest(p_target_manual,0),
    greatest(p_target_context,0),
    greatest(p_target_deps,0),
    greatest(p_portable_ready,0),
    greatest(p_total_skills,0),
    greatest(p_drift,0),
    p_complete
  )
  returning * into v_result;

  return jsonb_build_object(
    'id', v_result.id,
    'team_id', v_result.team_id,
    'target', v_result.target,
    'runtime', v_result.runtime,
    'complete', v_result.complete,
    'created_at', v_result.created_at
  );
end;
$$;

create or replace function public.apc_team_snapshot(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
with team as (
  select id, name, invite_code, target, runtime, created_at
  from public.apc_teams
  where invite_code = p_code
  limit 1
),
latest as (
  select distinct on (r.user_id)
    r.user_id, r.target, r.runtime, r.target_ready, r.target_total,
    r.target_auto, r.target_manual, r.target_context, r.target_deps,
    r.portable_ready, r.total_skills, r.drift, r.complete, r.created_at
  from public.apc_saved_results r
  join team t on t.id = r.team_id
  order by r.user_id, r.created_at desc
),
rows as (
  select
    coalesce(nullif(m.display_name,''), 'Teammate') as display_name,
    m.joined_at,
    l.target,
    l.runtime,
    case when l.target is not null then l.target_ready else l.portable_ready end as ready,
    case when l.target is not null then l.target_total else l.total_skills end as total,
    case
      when l.user_id is null then null
      when (case when l.target is not null then l.target_total else l.total_skills end) > 0
        then round(
          100.0 *
          (case when l.target is not null then l.target_ready else l.portable_ready end) /
          (case when l.target is not null then l.target_total else l.total_skills end)
        )::int
      else null
    end as percent,
    l.target_auto, l.target_manual, l.target_context, l.target_deps,
    l.drift, l.complete, l.created_at as result_created_at
  from public.apc_team_members m
  join team t on t.id = m.team_id
  left join latest l on l.user_id = m.user_id
)
select jsonb_build_object(
  'team', jsonb_build_object(
    'name', t.name,
    'invite_code', t.invite_code,
    'target', t.target,
    'runtime', t.runtime,
    'created_at', t.created_at
  ),
  'leaderboard', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'display_name', r.display_name,
        'joined_at', r.joined_at,
        'result', case
          when r.result_created_at is null then null
          else jsonb_build_object(
            'target', r.target,
            'runtime', r.runtime,
            'ready', r.ready,
            'total', r.total,
            'percent', r.percent,
            'auto_fix', coalesce(r.target_auto,0),
            'manual', coalesce(r.target_manual,0),
            'context_gaps', coalesce(r.target_context,0),
            'dependency_blockers', coalesce(r.target_deps,0),
            'drift', coalesce(r.drift,0),
            'complete', coalesce(r.complete,false),
            'created_at', r.result_created_at
          )
        end
      )
      order by r.percent desc nulls last, r.display_name
    )
    from rows r
  ), '[]'::jsonb)
)
from team t;
$$;

revoke execute on function public.apc_create_team(text,text,text,text) from public, anon;
revoke execute on function public.apc_join_team(text,text) from public, anon;
revoke execute on function public.apc_save_result(text,text,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,boolean) from public, anon;
revoke execute on function public.apc_team_snapshot(text) from public;

grant execute on function public.apc_create_team(text,text,text,text) to authenticated;
grant execute on function public.apc_join_team(text,text) to authenticated;
grant execute on function public.apc_save_result(text,text,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,boolean) to authenticated;
grant execute on function public.apc_team_snapshot(text) to anon, authenticated;
