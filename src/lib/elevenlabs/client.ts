/**
 * Server-only ElevenLabs helpers: minting the short-lived signed URL the
 * browser client needs to start a conversation (ElevenLabs, unlike Vapi,
 * doesn't allow starting a call from just a public key — see
 * https://elevenlabs.io/docs/conversational-ai/customization/authentication),
 * fetching a conversation's recorded audio on demand, and webhook signature
 * verification.
 */
import { timingSafeEqual, createHmac } from "node:crypto";

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
 * Fetches a conversation's recorded audio directly from ElevenLabs' API,
 * pull-based, the same posture as `src/lib/vapi/client.ts`'s
 * `fetchFreshRecordingUrl` — mirrors how Vapi recordings work rather than
 * relying on the `post_call_audio` webhook, which pushes the full audio as
 * base64 in the request body and gets rejected by Vercel's ~4.5MB serverless
 * request-body limit for any interview of meaningful length (confirmed via
 * production 413s, 2026-08-30). Returns `null` (rather than throwing) on any
 * failure — a dashboard page showing "no recording available" is a
 * reasonable degraded state.
 */
export async function fetchConversationAudio(conversationId: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing required environment variable: ELEVENLABS_API_KEY");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!res.ok) {
      console.error(
        `ElevenLabs conversation audio fetch failed for ${conversationId}: ${res.status}`,
      );
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error(`Failed to fetch recording for conversation ${conversationId}:`, error);
    return null;
  }
}
