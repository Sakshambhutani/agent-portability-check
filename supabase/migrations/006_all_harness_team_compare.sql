-- Add first-class all-harness Team Compare summaries without breaking v1 RPCs.

alter table public.apc_teams
  add column if not exists mode text not null default 'single';

alter table public.apc_teams
  drop constraint if exists apc_teams_mode_check;

alter table public.apc_teams
  add constraint apc_teams_mode_check
  check (mode in ('single','all'));

alter table public.apc_saved_results
  add column if not exists mode text not null default 'single',
  add column if not exists all_targets_ready integer not null default 0,
  add column if not exists all_targets_total integer not null default 0,
  add column if not exists all_manual_targets integer not null default 0,
  add column if not exists all_context_targets integer not null default 0,
  add column if not exists all_dependency_blockers integer not null default 0;

alter table public.apc_saved_results
  drop constraint if exists apc_saved_results_mode_check;

alter table public.apc_saved_results
  add constraint apc_saved_results_mode_check
  check (mode in ('single','all'));

alter table public.apc_saved_results
  drop constraint if exists apc_saved_results_all_ready_check;

alter table public.apc_saved_results
  add constraint apc_saved_results_all_ready_check
  check (
    all_targets_ready >= 0
    and all_targets_total >= 0
    and all_targets_ready <= all_targets_total
    and all_manual_targets >= 0
    and all_context_targets >= 0
    and all_dependency_blockers >= 0
  );

create or replace function public.apc_create_team_v2(
  p_name text,
  p_target text default null,
  p_runtime text default 'local',
  p_display_name text default null,
  p_mode text default 'single'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.apc_teams%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_mode not in ('single','all') then
    raise exception 'invalid_mode';
  end if;
  if p_target is not null and p_target not in (
    'claude','codex','cursor','gemini','copilot','opencode','roo'
  ) then
    raise exception 'invalid_target';
  end if;
  if p_runtime not in ('local','cloud') then
    raise exception 'invalid_runtime';
  end if;
  if p_mode = 'all' and (p_target is not null or p_runtime <> 'local') then
    raise exception 'invalid_all_mode_target';
  end if;

  v_code := translate(trim(trailing '=' from encode(gen_random_bytes(9), 'base64')), '+/', '-_');

  insert into public.apc_teams(owner_user_id, name, invite_code, target, runtime, mode)
  values (
    v_uid,
    left(coalesce(nullif(trim(p_name), ''), 'My Agent Team'), 80),
    v_code,
    p_target,
    p_runtime,
    p_mode
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
    'mode', v_team.mode,
    'created_at', v_team.created_at
  );
end;
$$;

create or replace function public.apc_save_result_v2(
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
  p_complete boolean default false,
  p_mode text default 'single',
  p_all_targets_ready integer default 0,
  p_all_targets_total integer default 0,
  p_all_manual_targets integer default 0,
  p_all_context_targets integer default 0,
  p_all_dependency_blockers integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.apc_teams%rowtype;
  v_result public.apc_saved_results%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_mode not in ('single','all') then
    raise exception 'invalid_mode';
  end if;
  if p_target is not null and p_target not in (
    'claude','codex','cursor','gemini','copilot','opencode','roo'
  ) then
    raise exception 'invalid_target';
  end if;
  if p_runtime not in ('local','cloud') then
    raise exception 'invalid_runtime';
  end if;
  if p_mode = 'all' and (p_target is not null or p_runtime <> 'local') then
    raise exception 'invalid_all_mode_target';
  end if;
  if p_all_targets_ready < 0
     or p_all_targets_total < 0
     or p_all_targets_ready > p_all_targets_total
     or p_all_manual_targets < 0
     or p_all_context_targets < 0
     or p_all_dependency_blockers < 0 then
    raise exception 'invalid_all_summary';
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

    if v_team.mode is distinct from p_mode then
      raise exception 'team_mode_mismatch';
    end if;

    if p_mode = 'single'
       and (v_team.target is distinct from p_target or v_team.runtime is distinct from p_runtime) then
      raise exception 'team_target_mismatch';
    end if;
  end if;

  insert into public.apc_saved_results(
    user_id, team_id, referral_id, target, runtime,
    target_ready, target_total, target_auto, target_manual,
    target_context, target_deps, portable_ready, total_skills,
    drift, complete, mode, all_targets_ready, all_targets_total,
    all_manual_targets, all_context_targets, all_dependency_blockers
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
    p_complete,
    p_mode,
    greatest(p_all_targets_ready,0),
    greatest(p_all_targets_total,0),
    greatest(p_all_manual_targets,0),
    greatest(p_all_context_targets,0),
    greatest(p_all_dependency_blockers,0)
  )
  returning * into v_result;

  return jsonb_build_object(
    'id', v_result.id,
    'team_id', v_result.team_id,
    'target', v_result.target,
    'runtime', v_result.runtime,
    'mode', v_result.mode,
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
set search_path = public, auth, extensions
as $$
with team as (
  select id, name, invite_code, target, runtime, mode, created_at
  from public.apc_teams
  where invite_code = p_code
  limit 1
),
latest as (
  select distinct on (r.user_id)
    r.user_id, r.target, r.runtime, r.mode,
    r.target_ready, r.target_total, r.target_auto, r.target_manual,
    r.target_context, r.target_deps,
    r.portable_ready, r.total_skills, r.drift,
    r.all_targets_ready, r.all_targets_total, r.all_manual_targets,
    r.all_context_targets, r.all_dependency_blockers,
    r.complete, r.created_at
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
    l.mode,
    case
      when l.mode = 'all' then l.all_targets_ready
      when l.target is not null then l.target_ready
      else l.portable_ready
    end as ready,
    case
      when l.mode = 'all' then l.all_targets_total
      when l.target is not null then l.target_total
      else l.total_skills
    end as total,
    case
      when l.user_id is null then null
      when (
        case
          when l.mode = 'all' then l.all_targets_total
          when l.target is not null then l.target_total
          else l.total_skills
        end
      ) > 0
      then round(
        100.0 *
        (
          case
            when l.mode = 'all' then l.all_targets_ready
            when l.target is not null then l.target_ready
            else l.portable_ready
          end
        ) /
        (
          case
            when l.mode = 'all' then l.all_targets_total
            when l.target is not null then l.target_total
            else l.total_skills
          end
        )
      )::int
      else null
    end as percent,
    case when l.mode = 'all' then 0 else l.target_auto end as target_auto,
    case when l.mode = 'all' then l.all_manual_targets else l.target_manual end as target_manual,
    case when l.mode = 'all' then l.all_context_targets else l.target_context end as target_context,
    case when l.mode = 'all' then l.all_dependency_blockers else l.target_deps end as target_deps,
    l.drift,
    l.complete,
    l.created_at as result_created_at
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
    'mode', t.mode,
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
            'target', case when r.mode = 'all' then 'all' else r.target end,
            'runtime', r.runtime,
            'mode', r.mode,
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

revoke execute on function public.apc_create_team_v2(text,text,text,text,text) from public, anon;
revoke execute on function public.apc_save_result_v2(
  text,text,text,text,integer,integer,integer,integer,integer,integer,
  integer,integer,integer,boolean,text,integer,integer,integer,integer,integer
) from public, anon;

grant execute on function public.apc_create_team_v2(text,text,text,text,text) to authenticated;
grant execute on function public.apc_save_result_v2(
  text,text,text,text,integer,integer,integer,integer,integer,integer,
  integer,integer,integer,boolean,text,integer,integer,integer,integer,integer
) to authenticated;
