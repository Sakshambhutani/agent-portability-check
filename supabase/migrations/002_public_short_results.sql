-- Short public summary results for browser handoff and resume/reopen.
-- No skill names, file paths, repo names, instruction contents, or skill contents.

create table if not exists public.apc_public_results (
  code text primary key check (char_length(code) between 8 and 40),
  score integer check (score between 0 and 100 or score is null),
  total integer not null default 0 check (total between 0 and 999),
  portable integer not null default 0 check (portable between 0 and total),
  ready integer not null default 0 check (ready between 0 and total),
  shared integer not null default 0 check (shared between 0 and total),
  drift integer not null default 0 check (drift between 0 and 999),
  agents text[] not null default '{}'::text[],
  target text check (target in ('claude','codex','cursor') or target is null),
  target_ready integer not null default 0 check (target_ready between 0 and 999),
  target_total integer not null default 0 check (target_total between 0 and 999),
  target_auto integer not null default 0 check (target_auto between 0 and 999),
  target_manual integer not null default 0 check (target_manual between 0 and 999),
  target_context integer not null default 0 check (target_context between 0 and 999),
  target_deps integer not null default 0 check (target_deps between 0 and 999),
  runtime text not null default 'local' check (runtime in ('local','cloud')),
  target_complete boolean not null default false,
  team_code text check (team_code is null or char_length(team_code) <= 40),
  created_at timestamptz not null default now(),
  check (target_ready <= target_total or target is null)
);

alter table public.apc_public_results enable row level security;
create index if not exists apc_public_results_created_idx
  on public.apc_public_results(created_at desc);

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
  if p_target is not null and p_target not in ('claude','codex','cursor') then raise exception 'invalid_target'; end if;
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
    where lower(a) in ('codex','claude','cursor')
    limit 3
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

create or replace function public.apc_public_result_snapshot(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'score', score, 'total', total, 'portable', portable, 'ready', ready,
    'shared', shared, 'drift', drift, 'agents', agents, 'target', target,
    'targetReady', target_ready, 'targetTotal', target_total,
    'targetAuto', target_auto, 'targetManual', target_manual,
    'targetContext', target_context, 'targetDeps', target_deps,
    'runtime', runtime, 'targetComplete', target_complete, 'team', team_code
  )
  from public.apc_public_results
  where code = p_code
  limit 1;
$$;

revoke all on table public.apc_public_results from anon, authenticated;
revoke execute on function public.apc_create_public_result(integer,integer,integer,integer,integer,integer,text[],text,integer,integer,integer,integer,integer,integer,text,boolean,text) from public;
revoke execute on function public.apc_public_result_snapshot(text) from public;
grant execute on function public.apc_create_public_result(integer,integer,integer,integer,integer,integer,text[],text,integer,integer,integer,integer,integer,integer,text,boolean,text) to anon, authenticated;
grant execute on function public.apc_public_result_snapshot(text) to anon, authenticated;
