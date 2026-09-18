import { NextResponse } from "next/server";
import { getStudyRepository } from "@/repositories/get-study-repository";

// Without this, Next.js statically caches this GET handler per `id` at
// build/first-request time (it uses no dynamic Request APIs otherwise) —
// verified live: a GET right after POST /close returned pre-close data.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const study = await getStudyRepository().getById(params.id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(study);
}

/**
 * Admin-only "remove study" action, confirmed client-side before this
 * request is ever sent (see remove-study-button.tsx) — every route under
 * `/api/studies` other than the public intake endpoint already requires a
 * logged-in PM session (see requiresAuth in route-protection.ts), so no
 * additional role check is needed here. Hard deletes the study; every
 * interview/summary/report belonging to it cascades away too (see
 * 0001_init.sql's `on delete cascade` foreign keys).
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const studyRepo = getStudyRepository();
  const study = await studyRepo.getById(params.id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  await studyRepo.delete(params.id);
  return new NextResponse(null, { status: 204 });
}
