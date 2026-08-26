import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget beacon from `live-call.tsx`: the browser tab was hidden
 * (backgrounded/screen locked) while the interview's call was in progress.
 * Overwrites with the latest hidden-event time on repeat calls — the most
 * recent backgrounding is what matters for reporting, no need to track every
 * occurrence. Best-effort: swallow a missing/unknown interview id rather
 * than error, since this must never surface anything to the participant.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await getInterviewRepository().update(params.id, { backgroundedAt: new Date() });
  } catch {
    // Best-effort signal — ignore failures (unknown id, transient DB error).
  }
  return new NextResponse(null, { status: 204 });
}
