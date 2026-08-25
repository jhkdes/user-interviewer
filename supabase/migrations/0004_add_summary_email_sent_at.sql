-- Tracks whether the post-interview "here's what you told us" summary email
-- (#6) was actually sent, so interviews whose send failed or was never
-- attempted (e.g. RESEND_API_KEY missing at the time) can be found and
-- backfilled later via scripts/resend-summary-emails.ts, rather than being
-- silently and permanently lost after a single failed webhook attempt.
alter table interviews add column summary_email_sent_at timestamptz;
