import { NextResponse } from "next/server";
import { renderReportHtml } from "@/job-search-study/report/render-html";
import { renderReportPdf } from "@/job-search-study/report/render-pdf";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";

export const dynamic = "force-dynamic";
/** Starting Chromium and printing the page takes several seconds. */
export const maxDuration = 60;

/** The report as the PDF the participant would be emailed, for the reviewer to check. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; reportId: string } },
) {
  const report = await getJobSearchReportRepository().getById(params.reportId);
  if (!report || report.studyId !== params.id || !report.report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  try {
    const pdf = await renderReportPdf(renderReportHtml(report.report));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Your-Job-Search-Report.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to create the report PDF:", error);
    return NextResponse.json({ error: "Could not create the PDF" }, { status: 500 });
  }
}
