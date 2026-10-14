import { NextResponse } from "next/server";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { InvalidStudyInputError, updateParticipantCopy } from "@/study-service";

export const dynamic = "force-dynamic";

/**
 * Saves the custom landing and ending page text. Send `{ "participantCopy": null }`
 * to go back to the standard wording. `"channel": "text"` saves the text link's
 * wording instead of the voice link's (null there follows the voice link).
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as {
    participantCopy?: unknown;
    channel?: unknown;
  } | null;
  if (!body || !("participantCopy" in body)) {
    return NextResponse.json({ error: "participantCopy is required" }, { status: 400 });
  }

  if (body.channel !== undefined && body.channel !== "voice" && body.channel !== "text") {
    return NextResponse.json({ error: "channel must be voice or text" }, { status: 400 });
  }

  try {
    const study = await updateParticipantCopy(
      getStudyRepository(),
      params.id,
      body.participantCopy,
      body.channel === "text" ? "text" : "voice",
    );
    return NextResponse.json(study);
  } catch (error) {
    if (error instanceof InvalidStudyInputError) {
      return NextResponse.json({ error: error.message, fields: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
