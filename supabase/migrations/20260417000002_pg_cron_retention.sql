-- Retention: free-tier samples older than 7 days are swept nightly.
-- Paid users keep samples forever. Downgrading paid → free lets the next
-- sweep trim the user's backlog (no schema change required).
--
-- The `ingest` Edge Function also runs an opportunistic trim for the calling
-- user if they're on free tier, so active free users stay within retention
-- between cron runs.

create extension if not exists pg_cron with schema extensions;

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
