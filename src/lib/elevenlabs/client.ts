/**
 * Server-only ElevenLabs helpers: minting the short-lived signed URL the
 * browser client needs to start a conversation (ElevenLabs, unlike Vapi,
 * doesn't allow starting a call from just a public key — see
 * https://elevenlabs.io/docs/conversational-ai/customization/authentication),
 * the Supabase Storage plumbing for recordings ElevenLabs pushes to us via
 * webhook rather than exposing a re-fetchable presigned URL like Vapi, and
 * webhook signature verification.
 */
import { timingSafeEqual, createHmac } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/client";

const CALL_RECORDINGS_BUCKET = "call-recordings";

interface ElevenLabsSignedUrlResponse {
  signed_url?: string;
}

/**
 * Fetches a short-lived (~15 min) signed WebSocket URL for starting a
 * conversation with the given agent. Returns `null` (rather than throwing)
 * on any failure — the caller surfaces this as a generic call-setup error to
 * the participant, same degraded-state posture as Vapi's recording fetch.
 */
export async function fetchSignedUrl(agentId: string): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing required environment variable: ELEVENLABS_API_KEY");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`ElevenLabs get-signed-url failed: ${res.status} ${body}`);
      return null;
    }
    const body = (await res.json()) as ElevenLabsSignedUrlResponse;
    return body.signed_url ?? null;
  } catch (error) {
    console.error("Failed to fetch an ElevenLabs signed URL:", error);
    return null;
  }
}

const SIGNATURE_TOLERANCE_SECONDS = 30 * 60;

/**
 * Verifies an ElevenLabs webhook's `ElevenLabs-Signature` header
 * (`t=<unix seconds>,v0=<hex hmac-sha256>` — signing `${timestamp}.${rawBody}`
 * with the webhook's secret, per
 * https://elevenlabs.io/docs/eleven-api/resources/webhooks) against the raw
 * request body. Must be called with the raw body text, not a parsed/
 * re-serialized object — any re-serialization can change whitespace/key
 * order and invalidate the signature. Returns `false` (never throws) for any
 * failure — missing header, expired timestamp (replay protection, 30 min
 * tolerance), or a mismatched signature — so the caller can uniformly reject.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Uploads a base64-encoded MP3 (as delivered by the `post_call_audio`
 * webhook) to the `call-recordings` bucket at `${conversationId}.mp3`.
 * Keyed by ElevenLabs' own conversation id rather than our interviewId
 * deliberately — `post_call_audio` carries no interviewId of its own
 * (unlike `post_call_transcription`), and ElevenLabs only retries webhook
 * delivery for `post_call_transcription`, not this one — so this upload
 * can't depend on the interview record already existing/being resolvable.
 * The path is instead derived at read time from
 * `interview.elevenLabsConversationId` (see the interview detail page).
 */
export async function uploadCallRecording(
  conversationId: string,
  base64Mp3: string,
): Promise<string> {
  const client = createServerSupabaseClient();
  const path = `${conversationId}.mp3`;
  const { error } = await client.storage
    .from(CALL_RECORDINGS_BUCKET)
    .upload(path, Buffer.from(base64Mp3, "base64"), { contentType: "audio/mpeg", upsert: true });

  if (error) {
    throw new Error(`Failed to upload call recording for conversation ${conversationId}: ${error.message}`);
  }
  return path;
}

/**
 * Fetches a fresh signed URL for a previously uploaded recording. Returns
 * `null` (rather than throwing) on any failure — mirrors
 * `src/lib/vapi/client.ts`'s `fetchFreshRecordingUrl` degraded-state posture.
 */
export async function fetchStorageSignedUrl(path: string): Promise<string | null> {
  try {
    const client = createServerSupabaseClient();
    const { data, error } = await client.storage
      .from(CALL_RECORDINGS_BUCKET)
      .createSignedUrl(path, 60 * 10); // 10 minutes — long enough for one dashboard view

    if (error) {
      console.error(`Failed to create a signed URL for recording ${path}:`, error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error(`Failed to create a signed URL for recording ${path}:`, error);
    return null;
  }
}
