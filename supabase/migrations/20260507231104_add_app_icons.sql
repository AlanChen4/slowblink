-- app_icons: per-user mirror of locally-resolved macOS app icons.
-- Unlike samples, icons are not abuse-sensitive (no row cap, no timestamp
-- integrity), so the client can write directly with per-user RLS rather
-- than going through a metered Edge Function.

create table public.app_icons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_name text not null,
  data_url text not null,
  updated_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (user_id, app_name)
);

alter table public.app_icons enable row level security;
alter table public.app_icons force row level security;

create index app_icons_user_id on public.app_icons (user_id);

create policy "app_icons_self_select"
  on public.app_icons for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "app_icons_self_insert"
  on public.app_icons for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "app_icons_self_update"
  on public.app_icons for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "app_icons_self_delete"
  on public.app_icons for delete
  to authenticated
  using ((select auth.uid()) = user_id);
