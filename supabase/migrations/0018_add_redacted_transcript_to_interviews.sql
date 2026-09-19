alter table interviews add column redacted_transcript jsonb;
alter table interviews add column redacted_at timestamptz;
