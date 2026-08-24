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
