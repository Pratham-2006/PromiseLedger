create table if not exists public.workspace_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint workspace_state_object check (jsonb_typeof(state) = 'object'),
  constraint workspace_state_size check (octet_length(state::text) <= 4000000)
);

alter table public.workspace_states enable row level security;
revoke all on table public.workspace_states from public, anon, authenticated;
grant select, insert, update on table public.workspace_states to authenticated;

drop policy if exists "Users can read their workspace state" on public.workspace_states;
create policy "Users can read their workspace state"
  on public.workspace_states for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their workspace state" on public.workspace_states;
create policy "Users can create their workspace state"
  on public.workspace_states for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their workspace state" on public.workspace_states;
create policy "Users can update their workspace state"
  on public.workspace_states for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.save_workspace_state(p_state jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_workspace_revision' using errcode = '22023';
  end if;
  if p_state is null
    or jsonb_typeof(p_state) is distinct from 'object'
    or p_state->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_state->'commitments') is distinct from 'array'
    or jsonb_typeof(p_state->'customers') is distinct from 'array'
    or jsonb_typeof(p_state->'settings') is distinct from 'object'
    or octet_length(p_state::text) > 4000000 then
    raise exception 'invalid_workspace_state' using errcode = '22023';
  end if;
  if p_expected_revision > 0
    and not exists (
      select 1
      from public.workspace_states
      where user_id = v_user_id
    ) then
    raise exception 'workspace_revision_conflict' using errcode = '40001';
  end if;

  insert into public.workspace_states as current_state (user_id, state, revision, updated_at)
  values (v_user_id, p_state, 1, now())
  on conflict (user_id) do update
    set state = excluded.state,
        revision = current_state.revision + 1,
        updated_at = now()
    where current_state.revision = p_expected_revision
  returning revision into v_revision;

  if v_revision is null then
    raise exception 'workspace_revision_conflict' using errcode = '40001';
  end if;

  return v_revision;
end;
$$;

revoke all on function public.save_workspace_state(jsonb, bigint) from public, anon;
grant execute on function public.save_workspace_state(jsonb, bigint) to authenticated;
