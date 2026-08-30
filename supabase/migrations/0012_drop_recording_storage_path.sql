-- recording_storage_path (added in 0011) is dropped in favor of deriving
-- the ElevenLabs recording's storage path from elevenlabs_conversation_id
-- at read time (`${elevenlabs_conversation_id}.mp3`). Storing it required
-- the post_call_audio webhook to resolve an interview by interviewId, but
-- that webhook carries no interviewId of its own and ElevenLabs only
-- retries failed post_call_transcription deliveries, never post_call_audio
-- ones — so a race where audio arrives before transcription (observed in
-- practice) permanently dropped the recording. Uploading keyed by
-- ElevenLabs' own conversation_id instead removes that dependency entirely.
alter table interviews drop column if exists recording_storage_path;
