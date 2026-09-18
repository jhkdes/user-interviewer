import { NextResponse } from "next/server";
import type { PreInterviewQuestion } from "@/domain";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { InvalidStudyInputError, updateStudyQuestions } from "@/study-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string;
    preInterviewQuestions?: PreInterviewQuestion[];
    feedbackQuestions?: string[];
    researchTopic?: string | null;
    customPrompt?: string | null;
  } | null;

  if (!body?.preInterviewQuestions && !body?.feedbackQuestions) {
    return NextResponse.json(
      { error: "preInterviewQuestions or feedbackQuestions is required" },
      { status: 400 },
    );
  }

  try {
    const study = await updateStudyQuestions(getStudyRepository(), params.id, {
      title: body.title,
      description: body.description,
      preInterviewQuestions: body.preInterviewQuestions,
      feedbackQuestions: body.feedbackQuestions,
      researchTopic: body.researchTopic,
      customPrompt: body.customPrompt,
    });
    return NextResponse.json(study);
  } catch (error) {
    if (error instanceof InvalidStudyInputError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
