import { NextResponse } from "next/server";
import { isTextInterviewModeEnabled } from "@/lib/feature-flags";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { switchToText } from "@/text-session/switch-to-text";

export const dynamic = "force-dynamic";

/**
 * "Can't use voice? Restart with a typing interview": discards the voice
 * attempt and resets the interview to a fresh text-mode one. Feedback studies
 * only, only while text mode is enabled, and only within the first seconds of
 * the call (or from the microphone-error screen). The browser must wait for
 * this to succeed before it stops the voice call. See TEXT_INTERVIEW_MODE.md.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await switchToText(
      {
        interviewRepo: getInterviewRepository(),
        studyRepo: getStudyRepository(),
        enabled: isTextInterviewModeEnabled(),
      },
      params.id,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({ mode: "text" });
  } catch (error) {
    console.error("Failed to restart an interview as a typing interview:", error);
    return NextResponse.json(
      { error: { code: "server-error", message: "Something went wrong on our side." } },
      { status: 500 },
    );
  }
}
