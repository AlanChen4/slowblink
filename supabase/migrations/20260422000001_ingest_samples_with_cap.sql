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
      (r->>'category')::text                             as category,
      nullif(r->>'confidence', '')::real                 as confidence,
      r->>'focused_app'                                  as focused_app,
      r->>'focused_window'                               as focused_window,
      coalesce(r->'open_windows', '[]'::jsonb)           as open_windows
    from jsonb_array_elements(p_rows) as r
  )
  insert into public.samples as s (
    user_id, client_id, ts, activity, category, confidence,
    focused_app, focused_window, open_windows
  )
  select * from rows_to_insert
  on conflict (user_id, client_id) do nothing
  returning s.id, s.client_id;
end;
$$;

revoke all on function public.ingest_samples_with_cap(uuid, jsonb, int) from public;
grant execute on function public.ingest_samples_with_cap(uuid, jsonb, int) to service_role;
