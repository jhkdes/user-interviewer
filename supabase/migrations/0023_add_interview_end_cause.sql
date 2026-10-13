-- How a voice call ended, so dropped calls can be counted and diagnosed.
--
-- end_cause:  'finished'    the interviewer wrapped the interview up itself
--             'interrupted' the call ended some other way (lost connection,
--                           long silence, the participant left, a provider error)
--             NULL          not recorded (typed interviews, and interviews
--                           that ended before this was tracked)
-- end_detail: the provider's own words about why, for diagnosis (for example
--             ElevenLabs' termination reason and error type).
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- Purely additive: it adds two nullable columns.

alter table interviews
  add column end_cause text check (end_cause in ('finished', 'interrupted')),
  add column end_detail jsonb;

-- The one interview that prompted this: a call that dropped after 3.5 minutes
-- when the participant's connection to ElevenLabs closed. Safe to leave out.
