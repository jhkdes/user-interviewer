import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import {
  ConsentRequiredError,
  InvalidIntakeError,
  StudyLinkInvalidError,
  StudyLinkNotFoundError,
  startInterview,
} from "@/participant-intake";

export const dynamic = "force-dynamic";

interface IntakeRequestBody {
  firstName?: string;
  email?: string;
  consentGiven?: boolean;
  deviceType?: string;
}

// Next.js requires the same dynamic-segment name across sibling routes at
// this URL position (see the sibling GET/close routes, which use the
// study's id) — despite the folder name, this route's `params.id` is the
// study's *link token* per REQUIREMENTS.md's participant flow: a
// participant only ever has the link, never the internal study id.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as IntakeRequestBody | null;
  if (!body) {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  try {
    const interview = await startInterview(
      { studyRepo: getStudyRepository(), interviewRepo: getInterviewRepository() },
      {
        linkToken: params.id,
        firstName: body.firstName ?? "",
        email: body.email ?? "",
        consentGiven: body.consentGiven ?? false,
        deviceType: body.deviceType,
      },
    );
    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    if (error instanceof StudyLinkNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof StudyLinkInvalidError) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: 410 });
    }
    if (error instanceof InvalidIntakeError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
