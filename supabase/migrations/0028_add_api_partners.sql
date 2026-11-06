-- Registered API clients for the partner API (see partner-api-phase1/
-- UI-PARTNER-API-SPEC.md, section 2), and the two columns that tie a study to
-- the partner that created it.
--
--   api_partners         One row per API client. Only a hash of its key is
--                        stored. webhook_url / webhook_secret are for the
--                        completion webhook (a later step).
--   studies.partner_id   The partner that created the study; NULL for every
--                        existing and dashboard-created study.
--   studies.owner_ref    The partner's own opaque id for who the study is for.
--                        Set together with partner_id, unique per partner.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- BEFORE deploying the code that reads these columns. Purely additive: the code
-- that is already deployed ignores both and keeps working. Preview and
-- Production share one database, so partner studies created through Preview
-- also show in the Production dashboard until Production runs this release
-- (they will look like ordinary studies, without the Partner badge).
--
-- RLS is enabled with no policies, like the other tables: the app reads and
-- writes through the service-role key, and anon/authenticated get nothing.
--
-- Create a partner with:  npm run create:partner -- --name=pfa-preview

create table api_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  key_hash text not null unique,
  webhook_url text,
  webhook_secret text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table api_partners enable row level security;

alter table studies
  add column partner_id uuid references api_partners (id),
  add column owner_ref text,
  add constraint studies_partner_owner_together
    check ((partner_id is null) = (owner_ref is null));

create unique index studies_partner_owner_ref_idx
  on studies (partner_id, owner_ref)
  where partner_id is not null;
