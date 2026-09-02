import type { VoiceProvider } from "./study";

export type InterviewStatus = "pending" | "in-progress" | "completed" | "expired";

export interface TranscriptEntry {
  speaker: "interviewer" | "participant";
  text: string;
  timestampMs: number;
}

export interface Interview {
  id: string;
  studyId: string;
  firstName: string;
  email: string;
  /** No longer collected on the intake form (M13) — the interviewer asks for it conversationally as the opening question instead. Backfilled from the transcript once the interview completes, if the participant clearly stated one (see summary-service); stays `null` otherwise. */
  roleDescription: string | null;
  status: InterviewStatus;
  consentGivenAt: Date | null;
  transcript: TranscriptEntry[] | null;
  /**
   * Vapi-hosted call recording URL captured at end-of-call-report time — no
   * separate audio storage for MVP (see REQUIREMENTS.md). This specific URL
   * is not reliably playable (Vapi's HIPAA-compliant storage requires signed
   * requests); `vapiCallId` below is what dashboard playback actually uses
   * to fetch a fresh, working presigned URL on demand.
   */
  recordingUrl: string | null;
  /** Vapi's call id — used to fetch a fresh presigned recording URL from Vapi's REST API at view time, since presigned URLs expire (~33 min) and can't be stored once and reused indefinitely. */
  vapiCallId: string | null;
  /** Which voice platform ran this interview's call — copied from the study's `voiceProvider` at creation time, so it stays stable even if the study's setting changes later. Determines which of `vapiCallId`/`elevenLabsConversationId` is populated. */
  voiceProvider: VoiceProvider;
  /**
   * ElevenLabs' conversation id — analogue of `vapiCallId`. `null` for Vapi
   * interviews. Used to fetch the recording on demand from ElevenLabs'
   * conversation-audio API at view time (see
   * src/lib/elevenlabs/client.ts's fetchConversationAudio), the same
   * pull-based posture as `vapiCallId` above rather than anything pushed via
   * webhook.
   */
  elevenLabsConversationId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  /** When the post-interview "here's what you told us" summary email (#6) was actually sent. `null` until then — including when it's never been attempted, failed, or was intentionally skipped for a non-substantive summary — so `scripts/resend-summary-emails.ts` can find and backfill it later. */
  summaryEmailSentAt: Date | null;
  /** Best-effort UA-based detection at intake time: `"desktop" | "mobile"`. `null` for interviews created before this field existed. Not authoritative (e.g. iPadOS Safari often reports a desktop-like UA) — informational only. */
  deviceType: string | null;
  /** Vapi's raw `endedReason` from the end-of-call-report (e.g. `"assistant-said-end-call-phrase"`, `"silence-timeout"`) — captured as-is, no in-house taxonomy on top. `null` until the call ends. */
  endedReason: string | null;
  /** Set client-side the first time the browser tab is backgrounded/hidden while this interview's call is in progress (see live-call.tsx). Overwritten on repeat backgrounding events — holds the most recent one. `null` if backgrounding was never detected. */
  backgroundedAt: Date | null;
  /** Pre-call screener answers (see participant-intake/screener-questions.ts), keyed by question id. Values are a single selected option, or an array for multi-select questions. `null` if the participant answered none of them (they're all optional). Shared with the AI interviewer as context — see system-prompt.ts's formatScreenerContext. */
  screenerAnswers: Record<string, string | string[]> | null;
  /** When InterviewAgent deterministically injected the "we're running low on time, can you keep going?" check-in (see termination.ts's SOFT_CAP_MS) — scripted rather than left to the LLM, since it proved unreliable at noticing the cue on its own. `null` until that turn happens; once set, it's asked exactly once per interview. */
  timeCheckAskedAt: Date | null;
  /** Whether the participant agreed (`true`) or declined (`false`) to extend the interview past the base 15-minute cap, decided on the turn immediately following the `timeCheckAskedAt` check-in — see InterviewAgent's TIME_CHECK_UTTERANCE decision turn. `null` until that turn resolves it, including for interviews that never reach the check-in at all. */
  extensionGranted: boolean | null;
  /** When InterviewAgent deterministically injected the final "we're almost out of time" check-in — only asked for interviews where `extensionGranted` is true, once approaching the extended 25-minute cap (see termination.ts's EXTENDED_SOFT_CAP_MS). `null` until that turn happens. */
  secondTimeCheckAskedAt: Date | null;
}
