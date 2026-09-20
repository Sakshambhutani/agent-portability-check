-- Expand Team Compare targets to the full supported harness set.

alter table public.apc_teams
  drop constraint if exists apc_teams_target_check;

alter table public.apc_teams
  add constraint apc_teams_target_check
  check (
    target in ('claude','codex','cursor','gemini','copilot','opencode','roo')
    or target is null
  );

alter table public.apc_saved_results
  drop constraint if exists apc_saved_results_target_check;

alter table public.apc_saved_results
  add constraint apc_saved_results_target_check
  check (
    target in ('claude','codex','cursor','gemini','copilot','opencode','roo')
    or target is null
  );

create or replace function public.apc_create_team(
  p_name text,
  p_target text default null,
  p_runtime text default 'local',
  p_display_name text default null
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
  if p_target is not null and p_target not in (
    'claude','codex','cursor','gemini','copilot','opencode','roo'
  ) then
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
  if p_target is not null and p_target not in (
    'claude','codex','cursor','gemini','copilot','opencode','roo'
  ) then
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

revoke execute on function public.apc_create_team(text,text,text,text) from public, anon;
revoke execute on function public.apc_save_result(
  text,text,text,text,integer,integer,integer,integer,integer,integer,
  integer,integer,integer,boolean
) from public, anon;

grant execute on function public.apc_create_team(text,text,text,text) to authenticated;
grant execute on function public.apc_save_result(
  text,text,text,text,integer,integer,integer,integer,integer,integer,
  integer,integer,integer,boolean
) to authenticated;
