-- ============================================================
-- 1. CUSTOMERS TABLE
-- ============================================================
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(trim(name)) > 0),
  normalized_name text not null,
  contact         text not null default '',
  notes           text not null default '',
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers(user_id);
create unique index if not exists customers_user_normalized_name_idx on public.customers(user_id, normalized_name);

alter table public.customers enable row level security;
revoke all on table public.customers from public, anon, authenticated;
grant select, insert, update, delete on table public.customers to authenticated;

create policy "customers_owner_select" on public.customers for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "customers_owner_insert" on public.customers for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "customers_owner_update" on public.customers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "customers_owner_delete" on public.customers for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- 2. COMMITMENTS TABLE
-- ============================================================
create table if not exists public.commitments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  title             text not null check (char_length(trim(title)) > 0),
  customer_name     text not null,
  category          text not null check (category in ('Delivery','Payment','Follow-up','Service','Purchase','Other')),
  original_due_date date,
  due_date          date,
  amount            numeric(15,2),
  currency          char(3) not null default 'INR',
  notes             text not null default '',
  status            text not null default 'Open' check (status in ('Open','In progress','Completed','Cancelled')),
  completion_notes  text not null default '',
  is_sample         boolean not null default false,
  priority          smallint not null default 0 check (priority between 0 and 3),
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  deleted_at        timestamptz
);

create index if not exists commitments_user_id_idx on public.commitments(user_id);
create index if not exists commitments_user_status_idx on public.commitments(user_id, status) where status not in ('Completed','Cancelled');
create index if not exists commitments_user_due_date_idx on public.commitments(user_id, due_date) where due_date is not null;
create index if not exists commitments_customer_id_idx on public.commitments(customer_id);

alter table public.commitments enable row level security;
revoke all on table public.commitments from public, anon, authenticated;
grant select, insert, update, delete on table public.commitments to authenticated;

create policy "commitments_owner_select" on public.commitments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "commitments_owner_insert" on public.commitments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "commitments_owner_update" on public.commitments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "commitments_owner_delete" on public.commitments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- 3. COMMITMENT EVENTS TABLE
-- ============================================================
create table if not exists public.commitment_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  commitment_id  uuid not null references public.commitments(id) on delete cascade,
  customer_name  text not null,
  type           text not null check (type in ('created','deadline_changed','status_changed','progress','completed','reopened','edited','deleted')),
  message        text not null,
  "from"         text,
  "to"           text,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists events_commitment_id_idx on public.commitment_events(commitment_id);
create index if not exists events_user_id_created_at_idx on public.commitment_events(user_id, created_at desc);

alter table public.commitment_events enable row level security;
revoke all on table public.commitment_events from public, anon, authenticated;
grant select, insert on table public.commitment_events to authenticated;

create policy "events_owner_select" on public.commitment_events for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "events_owner_insert" on public.commitment_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 4. USER SETTINGS TABLE
-- ============================================================
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  currency    char(3) not null default 'INR',
  date_format text not null default 'local' check (date_format in ('local','iso')),
  theme       text not null default 'system' check (theme in ('light','dark','system')),
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from public, anon, authenticated;
grant select, insert, update on table public.user_settings to authenticated;

create policy "settings_owner_select" on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "settings_owner_insert" on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "settings_owner_update" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 5. REMINDERS TABLE
-- ============================================================
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  commitment_id  uuid not null references public.commitments(id) on delete cascade,
  remind_at      timestamptz not null,
  channel        text not null default 'email' check (channel in ('email','push','both')),
  message        text not null default '',
  sent           boolean not null default false,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists reminders_user_sent_idx on public.reminders(user_id, sent, remind_at) where not sent;

alter table public.reminders enable row level security;
revoke all on table public.reminders from public, anon, authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;

create policy "reminders_owner" on public.reminders
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 6. RPC HELPER FUNCTIONS
-- ============================================================
create or replace function public.get_dashboard_stats(p_user_id uuid default auth.uid())
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'open_count',        count(*) filter (where status in ('Open','In progress') and deleted_at is null),
    'overdue_count',     count(*) filter (where status in ('Open','In progress') and due_date < current_date and deleted_at is null),
    'due_today_count',   count(*) filter (where status in ('Open','In progress') and due_date = current_date and deleted_at is null),
    'completed_30d',     count(*) filter (where status = 'Completed' and completed_at >= now() - interval '30 days' and deleted_at is null),
    'total',             count(*) filter (where deleted_at is null)
  )
  from public.commitments
  where user_id = p_user_id
    and not is_sample;
$$;

grant execute on function public.get_dashboard_stats(uuid) to authenticated;

create or replace function public.soft_delete_commitment(p_commitment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_name text;
begin
  select customer_name into v_customer_name
  from public.commitments
  where id = p_commitment_id and user_id = v_user_id;

  if not found then
    raise exception 'commitment_not_found' using errcode = 'P0002';
  end if;

  update public.commitments
  set deleted_at = now(), updated_at = now()
  where id = p_commitment_id and user_id = v_user_id;

  insert into public.commitment_events(user_id, commitment_id, customer_name, type, message)
  values (v_user_id, p_commitment_id, v_customer_name, 'deleted', 'Commitment deleted.');
end;
$$;

grant execute on function public.soft_delete_commitment(uuid) to authenticated;

create or replace function public.upsert_settings(p_currency char(3), p_date_format text, p_theme text default 'system')
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_settings(user_id, currency, date_format, theme)
  values (auth.uid(), p_currency, p_date_format, p_theme)
  on conflict (user_id) do update
    set currency = excluded.currency,
        date_format = excluded.date_format,
        theme = excluded.theme,
        updated_at = now();
$$;

grant execute on function public.upsert_settings(char, text, text) to authenticated;
