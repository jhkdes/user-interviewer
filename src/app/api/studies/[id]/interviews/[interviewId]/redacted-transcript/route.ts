import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * PM-only "save the reviewed/edited redacted transcript" action, the last
 * step of the printable interview export flow (see
 * redacted-transcript-editor.tsx). The client only ever sends the edited
 * text per turn — never the full `TranscriptEntry` shape — so `speaker` and
 * `timestampMs` are always taken from the real `transcript`, never from
 * client input.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; interviewId: string } },
) {
  const interviewRepo = getInterviewRepository();
  const interview = await interviewRepo.getById(params.interviewId);
  if (!interview || interview.studyId !== params.id) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }
  if (!interview.transcript || interview.transcript.length === 0) {
    return NextResponse.json({ error: "Interview has no transcript to redact" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { texts?: string[] } | null;
  const texts = body?.texts;
  if (!texts || texts.length !== interview.transcript.length) {
    return NextResponse.json(
      { error: `texts must be an array of ${interview.transcript.length} entries` },
      { status: 400 },
    );
  }

  const redactedTranscript = interview.transcript.map((entry, i) => ({
    ...entry,
    text: texts[i],
  }));

  const updated = await interviewRepo.update(params.interviewId, {
    redactedTranscript,
    redactedAt: new Date(),
  });

  return NextResponse.json(updated);
}
