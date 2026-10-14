import { NextResponse } from "next/server";
import { getTextState } from "@/text-session";
import { closeIfCapped } from "@/text-session/close-if-capped";
import { getTextSessionDeps } from "@/text-session/get-text-session-deps";

export const dynamic = "force-dynamic";

/**
 * Current state of a text interview — status, end reason, and messages — for
 * the participant's browser to draw, poll, or resume. Requires the study's
 * `linkToken` alongside the interview id; any mismatch (unknown interview,
 * wrong study, not a text interview) answers the same 404 so it reveals
 * nothing. See TEXT_INTERVIEW_MODE.md.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const linkToken = new URL(request.url).searchParams.get("linkToken");
  if (!linkToken) {
    return NextResponse.json({ error: "linkToken is required" }, { status: 400 });
  }

  try {
    const sessionDeps = getTextSessionDeps();
    const { interviewRepo, studyRepo, messageRepo } = sessionDeps;
    const read = () =>
      getTextState(
        { interviewRepo, studyRepo, messageRepo },
        { interviewId: params.id, linkToken },
      );

    let state = await read();
    if (!state) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    // A typed discovery session that has reached its time limit closes now,
    // so the open chat doesn't wait for the next scheduled sweep.
    if (state.status === "in-progress" && (await closeIfCapped(sessionDeps, params.id))) {
      state = (await read()) ?? state;
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read text-interview state:", error);
    return NextResponse.json({ error: "Failed to read the interview" }, { status: 500 });
  }
}
