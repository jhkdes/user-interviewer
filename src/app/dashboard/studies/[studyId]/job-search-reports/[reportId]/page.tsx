import Link from "next/link";
import { notFound } from "next/navigation";
import { reportUrl } from "@/job-search-study/pipeline/report-email";
import { loadExperimentLibrary } from "@/job-search-study/report/experiments";
import { renderReportHtml } from "@/job-search-study/report/render-html";
import { loadRubric } from "@/job-search-study/rubric/rubric";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { StatusChip } from "../status-chip";
import { ReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";

/** Reviewing one participant's report: preview, rule checks, the evidence behind each rating, and the release controls. */
export default async function JobSearchReportReviewPage({
  params,
}: {
  params: { studyId: string; reportId: string };
}) {
  const report = await getJobSearchReportRepository().getById(params.reportId);
  if (!report || report.studyId !== params.studyId) notFound();
  const interview = await getInterviewRepository().getById(report.interviewId);
  const rubric = loadRubric();
  const library = loadExperimentLibrary(rubric).experiments.map((e) => ({
    id: e.id,
    title: e.title,
    track: e.track,
  }));
  const violations = [...report.narrativeViolations, ...report.textViolations];
  const behaviorName = new Map(rubric.behaviors.map((b) => [b.id, b.name]));
  const shareUrl = report.accessToken
    ? reportUrl(process.env.APP_BASE_URL ?? "", report.accessToken)
    : null;
  const { scoring, aggregate } = report;

  return (
    <div>
      <Link
        href={`/dashboard/studies/${params.studyId}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to study
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          {interview?.firstName ?? "Participant"}&apos;s report
        </h1>
        <StatusChip status={report.status} />
      </div>
      {interview && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {interview.email} ·{" "}
          <Link
            href={`/dashboard/studies/${params.studyId}/interviews/${interview.id}`}
            className="underline"
          >
            interview and transcript
          </Link>
        </p>
      )}
      {report.error && (
        <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {report.error}
        </p>
      )}

      {violations.length > 0 && (
        <div className="mt-4 rounded border border-red-300 p-3 text-sm dark:border-red-800">
          <p className="font-medium text-red-700 dark:text-red-400">
            Rule violations to fix before release
          </p>
          <ul className="mt-1 list-disc pl-5">
            {violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      <ReviewPanel
        studyId={params.studyId}
        reportId={report.id}
        status={report.status}
        report={report.report}
        violations={violations}
        library={library}
        shareUrl={shareUrl}
        emailSent={report.emailSentAt !== null}
      />

      {report.report && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Preview (what the participant sees)</h2>
            <a
              href={`/api/studies/${params.studyId}/job-search-reports/${report.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline hover:no-underline"
            >
              Open the PDF that will be emailed
            </a>
          </div>
          <iframe
            title="Report preview"
            sandbox=""
            srcDoc={renderReportHtml(report.report)}
            className="mt-2 h-[900px] w-full rounded border border-neutral-200 dark:border-neutral-800"
          />
        </section>
      )}

      {scoring && aggregate && (
        <section className="mt-8">
          <h2 className="font-semibold">Evidence behind each rating (researcher only)</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Rubric {scoring.rubricVersion} · {aggregate.runs} extraction runs. Flags mark ratings to
            double-check.
          </p>
          {scoring.dimensions.map((dimension) => (
            <div key={dimension.id} className="mt-4">
              <h3 className="font-medium">
                {dimension.name}: {dimension.band?.text ?? "Not rated"}
                {dimension.score !== null && (
                  <span className="text-neutral-400"> ({Math.round(dimension.score)}/100)</span>
                )}
                {dimension.nearBandBoundary && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    near a band boundary
                  </span>
                )}
              </h3>
              <ul className="mt-1 space-y-2 text-sm">
                {scoring.behaviors
                  .filter((b) => b.dimension === dimension.id)
                  .map((b) => {
                    const evidence = aggregate.behaviors.find((a) => a.id === b.id);
                    return (
                      <li
                        key={b.id}
                        className="rounded border border-neutral-200 p-2 dark:border-neutral-800"
                      >
                        <p>
                          <span className="font-medium">{behaviorName.get(b.id) ?? b.id}</span>:{" "}
                          {b.outcome === "scored"
                            ? `${b.score}/4 (${b.label?.text})${b.capped ? `, capped from ${b.rawScore}` : ""}`
                            : b.outcome === "not_applicable"
                              ? "does not apply"
                              : "not enough to tell"}
                          {b.lowConfidence && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">
                              low confidence: {b.lowConfidenceReasons.join("; ")}
                            </span>
                          )}
                        </p>
                        {evidence && evidence.votes.length > 0 && (
                          <p className="text-neutral-500 dark:text-neutral-400">
                            Runs: {evidence.votes.map((v) => v.score ?? v.status).join(", ")}
                          </p>
                        )}
                        {evidence?.representative.statusReason && (
                          <p className="text-neutral-500 dark:text-neutral-400">
                            {evidence.representative.statusReason}
                          </p>
                        )}
                        {evidence?.representative.quotes.map((q, i) => (
                          <blockquote
                            key={i}
                            className="mt-1 border-l-2 border-neutral-300 pl-2 italic dark:border-neutral-700"
                          >
                            &ldquo;{q.text}&rdquo;{" "}
                            <span className="not-italic text-neutral-400">
                              (turn {q.turnIndex})
                            </span>
                          </blockquote>
                        ))}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {report.comparison && report.comparison.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Typical versus successful application (researcher only)</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-2">&nbsp;</th>
                <th className="py-1 pr-2">Typical</th>
                <th className="py-1">Successful</th>
              </tr>
            </thead>
            <tbody>
              {report.comparison.map((row) => (
                <tr
                  key={row.label}
                  className="border-t border-neutral-200 align-top dark:border-neutral-800"
                >
                  <td className="py-1 pr-2 font-medium">{row.label}</td>
                  <td className="py-1 pr-2">{row.typical ?? "—"}</td>
                  <td className="py-1">{row.successful ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
