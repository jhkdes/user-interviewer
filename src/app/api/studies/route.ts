import { NextResponse } from "next/server";
import type { TargetProfile } from "@/domain";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { createStudy, InvalidTargetProfileError } from "@/study-service";

// See src/app/api/studies/[id]/route.ts for why this is required — GET
// handlers are statically cached by default unless opted out.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    targetProfile?: TargetProfile;
    researchTopic?: string;
    customPrompt?: string;
  } | null;

  if (!body?.targetProfile) {
    return NextResponse.json({ error: "targetProfile is required" }, { status: 400 });
  }

  try {
    const study = await createStudy(getStudyRepository(), {
      targetProfile: body.targetProfile,
      researchTopic: body.researchTopic,
      customPrompt: body.customPrompt,
    });
    return NextResponse.json(study, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidTargetProfileError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    throw error;
  }
}

export async function GET() {
  const studies = await getStudyRepository().list();
  return NextResponse.json(studies);
}
