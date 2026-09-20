-- Expand short public results to the full supported harness adapter set.

alter table public.apc_public_results
  drop constraint if exists apc_public_results_target_check;

alter table public.apc_public_results
  add constraint apc_public_results_target_check
  check (
    target in ('claude','codex','cursor','gemini','copilot','opencode','roo')
    or target is null
  );

create or replace function public.apc_create_public_result(
  p_score integer default null,
  p_total integer default 0,
  p_portable integer default 0,
  p_ready integer default 0,
  p_shared integer default 0,
  p_drift integer default 0,
  p_agents text[] default '{}'::text[],
  p_target text default null,
  p_target_ready integer default 0,
  p_target_total integer default 0,
  p_target_auto integer default 0,
  p_target_manual integer default 0,
  p_target_context integer default 0,
  p_target_deps integer default 0,
  p_runtime text default 'local',
  p_target_complete boolean default false,
  p_team_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_agents text[];
begin
  if p_score is not null and (p_score < 0 or p_score > 100) then raise exception 'invalid_score'; end if;
  if p_total < 0 or p_total > 999
     or p_portable < 0 or p_portable > p_total
     or p_ready < 0 or p_ready > p_total
     or p_shared < 0 or p_shared > p_total
     or p_drift < 0 or p_drift > 999 then raise exception 'invalid_summary'; end if;
  if p_target is not null and p_target not in (
    'claude','codex','cursor','gemini','copilot','opencode','roo'
  ) then raise exception 'invalid_target'; end if;
  if p_runtime not in ('local','cloud') then raise exception 'invalid_runtime'; end if;
  if p_target is not null and (
    p_target_total < 0 or p_target_total > 999
    or p_target_ready < 0 or p_target_ready > p_target_total
    or p_target_auto < 0 or p_target_auto > 999
    or p_target_manual < 0 or p_target_manual > 999
    or p_target_context < 0 or p_target_context > 999
    or p_target_deps < 0 or p_target_deps > 999
  ) then raise exception 'invalid_target_summary'; end if;

  select coalesce(array_agg(x), '{}'::text[]) into v_agents
  from (
    select distinct lower(a) as x
    from unnest(coalesce(p_agents, '{}'::text[])) a
    where lower(a) in ('codex','claude','cursor','gemini','copilot','opencode','roo')
    limit 7
  ) q;

  loop
    v_code := translate(trim(trailing '=' from encode(gen_random_bytes(9), 'base64')), '+/', '-_');
    begin
      insert into public.apc_public_results(
        code, score, total, portable, ready, shared, drift, agents,
        target, target_ready, target_total, target_auto, target_manual,
        target_context, target_deps, runtime, target_complete, team_code
      ) values (
        v_code, p_score, p_total, p_portable, p_ready, p_shared, p_drift, v_agents,
        p_target, p_target_ready, p_target_total, p_target_auto, p_target_manual,
        p_target_context, p_target_deps, p_runtime, p_target_complete,
        nullif(left(regexp_replace(coalesce(p_team_code,''), '[^A-Za-z0-9_-]', '', 'g'), 40), '')
      );
      exit;
    exception when unique_violation then null;
    end;
  end loop;

  return v_code;
end;
$$;

revoke execute on function public.apc_create_public_result(
  integer,integer,integer,integer,integer,integer,text[],text,
  integer,integer,integer,integer,integer,integer,text,boolean,text
) from public;

grant execute on function public.apc_create_public_result(
  integer,integer,integer,integer,integer,integer,text[],text,
  integer,integer,integer,integer,integer,integer,text,boolean,text
) to anon, authenticated;
