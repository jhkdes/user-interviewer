-- Supports extending an interview past the base 15-minute cap up to 25
-- minutes when the participant is willing to keep going — see
-- InterviewAgent's TIME_CHECK_UTTERANCE decision turn and
-- termination.ts's EXTENDED_HARD_CAP_MINUTES.
alter table interviews add column extension_granted boolean;
alter table interviews add column second_time_check_asked_at timestamptz;
