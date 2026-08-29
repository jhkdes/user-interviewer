-- Tracks whether InterviewAgent has already deterministically injected the
-- "running low on time, can you keep going?" check-in for this interview, so
-- it's only ever asked once. See termination.ts's SOFT_CAP_MS.
alter table interviews add column time_check_asked_at timestamptz;
