-- Adds a per-study/per-interview voice provider selector (Vapi vs
-- ElevenLabs), so studies can be A/B tested against each other on which
-- platform runs their calls. interviews.voice_provider is copied from the
-- study at interview-creation time rather than joined live, so an interview
-- stays associated with whichever provider actually ran its call even if the
-- study's setting changes later.
alter table studies
  add column voice_provider text not null default 'vapi'
    check (voice_provider in ('vapi', 'elevenlabs'));

alter table interviews
  add column voice_provider text not null default 'vapi'
    check (voice_provider in ('vapi', 'elevenlabs'));

-- ElevenLabs' analogue of vapi_call_id.
alter table interviews add column elevenlabs_conversation_id text;

-- Supabase Storage object path for ElevenLabs recordings. ElevenLabs pushes
-- the full recording to us via a post_call_audio webhook (base64 MP3) rather
-- than exposing a re-fetchable presigned URL like Vapi does, so we upload it
-- ourselves to the call-recordings bucket and remember the path here.
alter table interviews add column recording_storage_path text;

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
