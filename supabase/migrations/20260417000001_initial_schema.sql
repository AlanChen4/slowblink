-- Initial slowblink schema: profiles, samples, stripe_events, retention,
-- and the atomic ingest RPC. Everything is in `public`. Tables use RLS
-- with separate policies per op.

create extension if not exists pg_cron with schema extensions;

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

-- samples: append-only time-series mirrored from local SQLite.
-- `client_id` is the local SQLite row id and serves as the idempotency key.

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  ts timestamptz not null,
  activity text not null,
  confidence real,
  focused_app text,
  focused_window text,
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

-- Atomic ingest: cap check + upsert in a single transaction under a per-user
-- advisory lock. Closes the TOCTOU race where two concurrent requests could
-- each pass a separate count() check and together insert above the cap.

create function public.ingest_samples_with_cap(
  p_user_id uuid,
  p_rows jsonb,
  p_cap int
)
returns table (id uuid, client_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_size int;
  v_count int;
begin
  v_batch_size := coalesce(jsonb_array_length(p_rows), 0);
  if v_batch_size = 0 then
    return;
  end if;

  -- Serialize concurrent ingests for this user so the count+insert below
  -- behave as one atomic step. Released at commit.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into v_count
    from public.samples
   where user_id = p_user_id
     and inserted_at >= now() - interval '1 day';

  if v_count + v_batch_size > p_cap then
    raise exception 'daily_row_cap_exceeded' using errcode = 'P0001';
  end if;

  return query
  with rows_to_insert as (
    select
      p_user_id                                          as user_id,
      (r->>'client_id')::text                            as client_id,
      (r->>'ts')::timestamptz                            as ts,
      (r->>'activity')::text                             as activity,
      nullif(r->>'confidence', '')::real                 as confidence,
      r->>'focused_app'                                  as focused_app,
      r->>'focused_window'                               as focused_window
    from jsonb_array_elements(p_rows) as r
  )
  insert into public.samples as s (
    user_id, client_id, ts, activity, confidence,
    focused_app, focused_window
  )
  select * from rows_to_insert
  on conflict (user_id, client_id) do nothing
  returning s.id, s.client_id;
end;
$$;

revoke all on function public.ingest_samples_with_cap(uuid, jsonb, int) from public;
grant execute on function public.ingest_samples_with_cap(uuid, jsonb, int) to service_role;

-- Retention: free-tier samples older than 7 days are swept nightly.
-- Paid users keep samples forever. Downgrading paid → free lets the next
-- sweep trim the user's backlog (no schema change required).
--
-- The `ingest` Edge Function also runs an opportunistic trim for the calling
-- user if they're on free tier, so active free users stay within retention
-- between cron runs.

select
  cron.schedule(
    'trim-free-tier-samples-7d',
    '0 3 * * *',
    $$
      delete from public.samples s
      using public.profiles p
      where s.user_id = p.id
        and p.tier = 'free'
        and s.inserted_at < now() - interval '7 days'
    $$
  );
