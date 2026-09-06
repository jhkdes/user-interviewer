import { NextResponse } from "next/server";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { extendLink } from "@/study-service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const study = await extendLink(getStudyRepository(), params.id);
    return NextResponse.json(study);
  } catch {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
