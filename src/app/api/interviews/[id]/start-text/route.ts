import { NextResponse } from "next/server";
import { isTextInterviewModeEnabled } from "@/lib/feature-flags";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { chooseTextMode } from "@/text-session/choose-text-mode";

export const dynamic = "force-dynamic";

/**
 * The participant picked "switch to typing" before their voice call began:
 * marks the pending interview as a text interview. Feedback studies only,
 * and only while text mode is enabled for the deploy. See
 * TEXT_INTERVIEW_MODE.md.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await chooseTextMode(
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
    console.error("Failed to switch an interview to typing:", error);
    return NextResponse.json(
      { error: { code: "server-error", message: "Something went wrong on our side." } },
      { status: 500 },
    );
  }
}
