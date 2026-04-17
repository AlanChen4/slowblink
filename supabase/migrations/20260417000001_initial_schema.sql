-- Initial slowblink schema: profiles, samples, stripe_events.
-- Everything is in `public`. Tables use RLS with separate policies per op.

-- ---------------------------------------------------------------------------
-- profiles: per-user billing tier + Stripe customer link.
-- Auto-created by a trigger on `auth.users` insert.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  tier text not null default 'free' check (tier in ('free', 'paid')),
  renews_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "profiles_self_select"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- No insert/update policies for clients. The trigger below owns inserts;
-- stripe-webhook (service_role) owns tier / stripe_customer_id updates.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- samples: append-only time-series mirrored from local SQLite.
-- `client_id` is the local SQLite row id and serves as the idempotency key.

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  ts timestamptz not null,
  activity text not null,
  category text not null,
  confidence real,
  focused_app text,
  focused_window text,
  open_windows jsonb,
  inserted_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table public.samples enable row level security;
alter table public.samples force row level security;

create index samples_user_ts on public.samples (user_id, ts desc);
create index samples_inserted_at on public.samples (inserted_at);
create index samples_user_id on public.samples (user_id);

create policy "samples_self_select"
  on public.samples for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "samples_self_delete"
  on public.samples for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update policies for clients. The `ingest` Edge Function writes
-- via service_role; forged timestamps or retention bypass are impossible
-- because RLS blocks direct client writes.

-- ---------------------------------------------------------------------------
-- stripe_events: idempotency log for the stripe-webhook Edge Function.
-- Primary key is the Stripe event id, so a replay returns 23505 and is a no-op.

create table public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;
-- Service role only; no policies granted.
