-- The call-recordings bucket (added in 0011) is no longer used:
-- ElevenLabs recordings are now fetched on demand from ElevenLabs' own
-- conversation-audio API at view time (see src/lib/elevenlabs/client.ts's
-- fetchConversationAudio) instead of being uploaded here by the
-- post_call_audio webhook, which was silently dropping recordings for any
-- interview long enough to exceed Vercel's serverless request-body limit.
delete from storage.objects where bucket_id = 'call-recordings';
delete from storage.buckets where id = 'call-recordings';
