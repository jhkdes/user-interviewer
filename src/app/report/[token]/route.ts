import { renderReportHtml } from "@/job-search-study/report/render-html";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // The page is private to the person holding the link: never cache it or let a search engine index it.
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const NOT_AVAILABLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Report not available</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>This report isn't available</h1><p>The link may have been withdrawn or mistyped. If you think this is a mistake, reply to the email that brought you here.</p></body></html>`;

/** The participant's report, reached by the unguessable link in their email. Only a released report is served. */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const report = await getJobSearchReportRepository().getByAccessToken(params.token);
  if (!report || report.status !== "released" || !report.report) {
    return new Response(NOT_AVAILABLE, { status: 404, headers: HEADERS });
  }
  return new Response(renderReportHtml(report.report), { status: 200, headers: HEADERS });
}
