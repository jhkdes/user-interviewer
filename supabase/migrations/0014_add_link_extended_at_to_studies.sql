-- Lets a PM reset a study's link-expiry clock without changing created_at —
-- see src/study-service/link-validity.ts's checkLinkValidity, which uses
-- link_extended_at (when set) instead of created_at as the start of the
-- 7-day expiry window.
alter table studies add column link_extended_at timestamptz;
