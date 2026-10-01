import { NextResponse } from "next/server";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { renderStudyTranscriptsMarkdown } from "@/study-report-service";

// See src/app/api/studies/[id]/route.ts for why this is required on routes
// that touch Supabase but use no dynamic Request API of their own.
export const dynamic = "force-dynamic";

/**
 * Downloads every interview's raw transcript in the study as one standalone
 * Markdown file, for pasting/uploading as LLM context — unlike the study
 * report, this needs no prior "generate" step; it's a pure, synchronous
 * rendering of data that already exists, so this route only ever needs GET.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const [study, interviews] = await Promise.all([
    getStudyRepository().getById(params.id),
    getInterviewRepository().listByStudyId(params.id),
  ]);
  if (!study) {
    return NextResponse.json({ error: `No study found for id: ${params.id}` }, { status: 404 });
  }

  const filename = `${study.title}-transcripts`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return new NextResponse(renderStudyTranscriptsMarkdown(study, interviews), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.md"`,
    },
  });
}
