import { NextResponse } from "next/server";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { InvalidStudyInputError, updateInterviewerLines } from "@/study-service";

export const dynamic = "force-dynamic";

/**
 * Saves a feedback study's two scripted interviewer lines. Send either or both
 * of `firstMessage` and `closingQuestion`; `null` puts a line back to the
 * standard wording.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as {
    firstMessage?: unknown;
    closingQuestion?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON body is required" }, { status: 400 });
  }

  try {
    const study = await updateInterviewerLines(getStudyRepository(), params.id, {
      firstMessage: body.firstMessage,
      closingQuestion: body.closingQuestion,
    });
    return NextResponse.json(study);
  } catch (error) {
    if (error instanceof InvalidStudyInputError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
