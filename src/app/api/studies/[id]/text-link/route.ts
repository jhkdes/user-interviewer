import { NextResponse } from "next/server";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { addTextLink } from "@/study-service";

export const dynamic = "force-dynamic";

/** Gives a study that has only a voice link its text-only link. Harmless to repeat: an existing text link is kept. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const study = await addTextLink(getStudyRepository(), params.id);
    return NextResponse.json(study);
  } catch {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
