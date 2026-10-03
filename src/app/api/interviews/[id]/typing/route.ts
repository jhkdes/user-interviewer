import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { recordTyping } from "@/text-session";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget signal from the text chat that the participant is typing a
 * reply, so the idle nudge and the inactivity timeout wait for them. Carries
 * no text. See TEXT_INTERVIEW_MODE.md.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await recordTyping(
      { interviewRepo: getInterviewRepository(), studyRepo: getStudyRepository() },
      params.id,
    );
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.code } }, { status: result.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to record a typing signal:", error);
    return NextResponse.json({ error: { code: "server-error" } }, { status: 500 });
  }
}
