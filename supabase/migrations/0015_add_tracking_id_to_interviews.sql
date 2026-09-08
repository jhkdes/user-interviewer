-- Optional participant-tracking id passed by a third-party tool as a
-- `tracking_id` URL query param on the interview link (see
-- src/app/interview/[linkToken]/page.tsx). Stored so the completion webhook
-- (src/notification-service/notify-completion-webhook.ts) can report back
-- which participant finished.
alter table interviews add column tracking_id text;
