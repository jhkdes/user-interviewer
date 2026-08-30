/**
 * Gate for verbose voice-session debug logging (raw custom-LLM request/
 * response bodies, raw webhook payloads, per-turn Claude timing) — off by
 * default since that content includes real participant conversation text
 * and would otherwise land in centralized production logs unconditionally.
 * Set `DEBUG_VOICE_SESSION=true` to enable for a deploy/session.
 */
export function isVoiceSessionDebugEnabled(): boolean {
  return process.env.DEBUG_VOICE_SESSION === "true";
}
