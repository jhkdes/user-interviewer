-- Partner API, step 5 (see partner-api-phase1/UI-PARTNER-API-SPEC.md, 3.8):
-- the queue behind the signed completion webhook.
--
--   partner_webhook_deliveries   One row per event to send to a partner. A row is
--                                created when a partner interview ends, sent as
--                                soon as it can be, and retried by a sweep (every
--                                5 minutes) with growing delays until it is
--                                delivered or 24 hours have passed. One row per
--                                (interview, event), so an event is queued once.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- BEFORE deploying the code that reads this table. Purely additive: the code that
-- is already deployed ignores it. Requires migrations 0028 and 0029.
--
-- Rows go away with their interview and their study (deleting either through the
-- partner API also deletes any waiting event).
--
-- RLS is enabled with no policies, like the other tables: the app reads and
-- writes through the service-role key, and anon/authenticated get nothing.

create table partner_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references api_partners (id),
  study_id uuid not null references studies (id) on delete cascade,
  interview_id uuid not null references interviews (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_status_code integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  expires_at timestamptz not null,
  unique (interview_id, event)
);

alter table partner_webhook_deliveries enable row level security;

create index partner_webhook_deliveries_due_idx
  on partner_webhook_deliveries (next_attempt_at)
  where status = 'pending';
