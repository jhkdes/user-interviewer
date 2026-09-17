import { NextResponse } from "next/server";
import type { PreInterviewQuestion, VoiceProvider } from "@/domain";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { createStudy, InvalidStudyInputError } from "@/study-service";

// See src/app/api/studies/[id]/route.ts for why this is required — GET
// handlers are statically cached by default unless opted out.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string;
    preInterviewQuestions?: PreInterviewQuestion[];
    researchTopic?: string;
    customPrompt?: string;
    voiceProvider?: VoiceProvider;
  } | null;

  if (!body?.title || !body.description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  try {
    const study = await createStudy(getStudyRepository(), {
      title: body.title,
      description: body.description,
      preInterviewQuestions: body.preInterviewQuestions ?? [],
      researchTopic: body.researchTopic,
      customPrompt: body.customPrompt,
      voiceProvider: body.voiceProvider,
    });
    return NextResponse.json(study, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidStudyInputError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    throw error;
  }
}

export async function GET() {
  const studies = await getStudyRepository().list();
  return NextResponse.json(studies);
}
