import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * PM-only "remove interview" action (#5): hard deletes an interview that
 * turned out irrelevant to the study (premature hangup, silence-timeout with
 * no real conversation, etc). Its `Summary` row goes with it automatically
 * via the `on delete cascade` foreign key (see 0001_init.sql) — no separate
 * cleanup needed, and it can no longer be pulled into study report
 * generation once gone.
 *
 * `params.id` here is the study's internal id, same as the sibling
 * GET/close/report routes — unlike `../route.ts`'s POST handler, which
 * (despite sharing this `[id]` segment name) treats it as the participant
 * link token instead. See that file's comment for why the segment name
 * can't differ between sibling routes.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; interviewId: string } },
) {
  const interviewRepo = getInterviewRepository();
  const interview = await interviewRepo.getById(params.interviewId);
  if (!interview || interview.studyId !== params.id) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  await interviewRepo.delete(params.interviewId);
  return new NextResponse(null, { status: 204 });
}
