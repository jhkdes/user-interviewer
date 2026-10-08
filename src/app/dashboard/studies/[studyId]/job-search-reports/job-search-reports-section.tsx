import Link from "next/link";
import type { Interview } from "@/domain";
import { getJobSearchReportRepository } from "@/job-search-study/storage/get-report-repository";
import { ProcessNowButton } from "./process-now-button";
import { StatusChip } from "./status-chip";

/** The study page's list of participant reports and where each stands in review. */
export async function JobSearchReportsSection({
  studyId,
  interviews,
}: {
  studyId: string;
  interviews: Interview[];
}) {
  const reports = await getJobSearchReportRepository().listByStudyId(studyId);
  const nameOf = new Map(interviews.map((i) => [i.id, i.firstName]));

  return (
    <section className="mt-8">
      <h2 className="font-semibold">Participant reports</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Each completed interview becomes a draft report. Review it, edit the wording, then release
        it to email the participant their private link.
      </p>
      {reports.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">No reports yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
          {reports.map((report) => {
            const violations = report.narrativeViolations.length + report.textViolations.length;
            return (
              <li key={report.id}>
                <Link
                  href={`/dashboard/studies/${studyId}/job-search-reports/${report.id}`}
                  className="flex items-center justify-between py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div>
                    <p className="font-medium">
                      {nameOf.get(report.interviewId) ?? "(unknown participant)"}
                    </p>
                    {report.error && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {report.error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {violations > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        {violations} rule violation{violations === 1 ? "" : "s"}
                      </span>
                    )}
                    {report.status === "released" && !report.emailSentAt && (
                      <span className="text-amber-600 dark:text-amber-400">email not sent</span>
                    )}
                    <StatusChip status={report.status} />
                    <span className="text-neutral-400">
                      {report.updatedAt.toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <ProcessNowButton studyId={studyId} />
      </div>
    </section>
  );
}
