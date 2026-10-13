import type { CallEndCause, CallEndDetail } from "@/domain";

/**
 * How a voice call ended, in terms we can count and track. "finished" means
 * the interviewer wrapped the interview up itself; "interrupted" means the
 * call ended some other way (a lost connection, a long silence, the participant
 * leaving, or a provider error). The provider's own words are kept alongside,
 * in `CallEndDetail`, so an interrupted call can be diagnosed later.
 */

export interface CallEnd {
  endCause: CallEndCause | null;
  endDetail: CallEndDetail | null;
}

/** The parts of ElevenLabs' post-call payload that say how the call ended. */
export interface ElevenLabsEndFields {
  status?: string;
  metadata?: {
    call_duration_secs?: number;
    termination_reason?: string;
    error?: { code?: number; reason?: string; error_type?: string } | null;
  };
  analysis?: { call_successful?: string };
}

/** What ElevenLabs reports when our interviewer ends the call with its end_call tool. */
const FINISHED_BY_INTERVIEWER = /end_call tool was called/i;

export function classifyElevenLabsEnd(data: ElevenLabsEndFields): CallEnd {
  const metadata = data.metadata;
  const hasEvidence =
    data.status !== undefined ||
    metadata?.termination_reason !== undefined ||
    metadata?.error !== undefined;
  if (!hasEvidence) return { endCause: null, endDetail: null };

  const error = metadata?.error ?? null;
  const finished =
    !error &&
    data.status !== "failed" &&
    FINISHED_BY_INTERVIEWER.test(metadata?.termination_reason ?? "");

  return {
    endCause: finished ? "finished" : "interrupted",
    endDetail: {
      provider: "elevenlabs",
      status: data.status ?? null,
      callSuccessful: data.analysis?.call_successful ?? null,
      terminationReason: metadata?.termination_reason ?? null,
      errorType: error?.error_type ?? null,
      errorCode: error?.code ?? null,
      errorReason: error?.reason ?? null,
      durationSecs: metadata?.call_duration_secs ?? null,
    },
  };
}

/** Vapi's `endedReason` values that mean the assistant ended the call itself. */
const VAPI_FINISHED =
  /^(assistant-ended-call|assistant-said-end-call-phrase|assistant-forwarded-call)$/;

export function classifyVapiEnd(endedReason: string | null | undefined): CallEnd {
  if (!endedReason) return { endCause: null, endDetail: null };
  return {
    endCause: VAPI_FINISHED.test(endedReason) ? "finished" : "interrupted",
    endDetail: { provider: "vapi", endedReason },
  };
}
