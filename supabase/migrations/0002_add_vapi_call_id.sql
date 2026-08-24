-- Interviews need the Vapi call id to fetch a fresh presigned recording URL
-- on demand (the URL captured at end-of-call-report time expires after
-- ~33 minutes, too short-lived to store and reuse for later dashboard views).
alter table interviews add column vapi_call_id text;
