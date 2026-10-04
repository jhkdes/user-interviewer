import { NextResponse } from "next/server";
import { getTextState } from "@/text-session";
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
    const { interviewRepo, studyRepo, messageRepo } = getTextSessionDeps();
    const state = await getTextState(
      { interviewRepo, studyRepo, messageRepo },
      { interviewId: params.id, linkToken },
    );
    if (!state) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read text-interview state:", error);
    return NextResponse.json({ error: "Failed to read the interview" }, { status: 500 });
  }
}
