-- Partner API, remaining scope (see src/partner-api/openapi.yaml):
--
--   partner_rate_limits          One counter per partner per minute. Every API
--                                request adds one; past the limit (60 a minute
--                                by default) the API answers 429. The count
--                                lives here, not in memory, because the app runs
--                                as many short-lived server instances.
--   partner_idempotency_keys     The answer to a write that carried an
--                                Idempotency-Key header, kept for 24 hours so a
--                                retry with the same key and the same request
--                                gets the same answer instead of doing the work
--                                twice.
--   partner_rate_limit_hit()     Adds one to a partner's counter for a minute and
--                                returns the new count, in one atomic step. Also
--                                clears old counters now and then.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- BEFORE deploying the code that uses them. Purely additive: the code that is
-- already deployed ignores them. Requires migration 0028.
--
-- RLS is enabled with no policies, like the other tables: the app reads and
-- writes through the service-role key, and anon/authenticated get nothing.

create table partner_rate_limits (
  partner_id uuid not null references api_partners (id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (partner_id, window_start)
);

alter table partner_rate_limits enable row level security;

create function partner_rate_limit_hit(p_partner_id uuid, p_window_start timestamptz)
returns integer
language plpgsql
as $$
declare
  hits integer;
begin
  insert into partner_rate_limits (partner_id, window_start, request_count)
  values (p_partner_id, p_window_start, 1)
  on conflict (partner_id, window_start)
  do update set request_count = partner_rate_limits.request_count + 1
  returning request_count into hits;

  -- Old minutes are of no use; tidy them up on about one call in a hundred.
  if random() < 0.01 then
    delete from partner_rate_limits where window_start < now() - interval '1 hour';
  end if;

  return hits;
end;
$$;

-- Only the service role may call it; PostgREST would otherwise expose it to anon.
revoke execute on function partner_rate_limit_hit(uuid, timestamptz)
  from public, anon, authenticated;

create table partner_idempotency_keys (
  partner_id uuid not null references api_partners (id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body text,
  response_content_type text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (partner_id, idempotency_key)
);

alter table partner_idempotency_keys enable row level security;

create index partner_idempotency_keys_created_idx on partner_idempotency_keys (created_at);
