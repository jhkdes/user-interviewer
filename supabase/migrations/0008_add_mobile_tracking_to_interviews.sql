-- Mobile-reliability tracking: best-effort device type at intake, Vapi's raw
-- end-of-call reason, and client-detected backgrounding during the call.
-- All nullable/optional.
alter table interviews add column device_type text;
alter table interviews add column ended_reason text;
alter table interviews add column backgrounded_at timestamptz;
