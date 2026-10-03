/**
 * Server-only Vapi REST client. Currently just the one call needed for
 * recording playback (T10.4): the `recordingUrl` captured at
 * end-of-call-report time points at Vapi's HIPAA-compliant storage, which
 * requires signed requests and isn't directly playable from a browser
 * `<audio>` tag. Vapi's call object separately exposes a presigned,
 * authentication-free URL (`artifact.presignedStereoUrl`) — but it expires
 * roughly 33 minutes after the call ends, so it can't just be captured once
 * and stored; a fresh one has to be fetched each time someone views the
 * recording, using the call's id (`Interview.vapiCallId`).
 */

interface VapiCallResponse {
  artifact?: {
    presignedStereoUrl?: string;
    presignedMonoUrl?: string;
  };
}

/**
 * Fetches a fresh presigned recording URL for a Vapi call. Returns `null`
 * (rather than throwing) on any failure — a dashboard page showing "no
 * recording available" is a reasonable degraded state; it shouldn't break
 * the whole page if Vapi's API is briefly unreachable.
 */
export async function fetchFreshRecordingUrl(vapiCallId: string): Promise<string | null> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("Missing required environment variable: VAPI_API_KEY");
    return null;
  }

  try {
    const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Vapi call lookup failed for ${vapiCallId}: ${res.status}`);
      return null;
    }
    const call = (await res.json()) as VapiCallResponse;
    return call.artifact?.presignedStereoUrl ?? call.artifact?.presignedMonoUrl ?? null;
  } catch (error) {
    console.error(`Failed to fetch a fresh recording URL for call ${vapiCallId}:`, error);
    return null;
  }
}

/**
 * Deletes a Vapi call and its recording. Used when a participant restarts as
 * a typing interview and the voice call they began is discarded (see
 * TEXT_INTERVIEW_MODE.md). Best-effort: returns whether it worked and never
 * throws, because a failed delete must not break webhook handling.
 */
export async function deleteVapiCall(vapiCallId: string): Promise<boolean> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("Missing required environment variable: VAPI_API_KEY");
    return false;
  }

  try {
    const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(vapiCallId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Vapi call delete failed for ${vapiCallId}: ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Failed to delete Vapi call ${vapiCallId}:`, error);
    return false;
  }
}
