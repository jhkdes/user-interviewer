import Link from "next/link";
import { notFound } from "next/navigation";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getStudyReportRepository } from "@/repositories/get-study-report-repository";
import { StudyLink } from "../../study-link";
import { GenerateReportButton } from "./generate-report-button";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "in-progress": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  pending: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

/** Study detail (T10.3): interviews list, shareable link, and study report (T10.5). */
export default async function StudyDetailPage({ params }: { params: { studyId: string } }) {
  const study = await getStudyRepository().getById(params.studyId);
  if (!study) notFound();

  const [interviews, report] = await Promise.all([
    getInterviewRepository().listByStudyId(study.id),
    getStudyReportRepository().getLatestByStudyId(study.id),
  ]);
  const sortedInterviews = [...interviews].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← All studies
      </Link>

      <h1 className="mt-2 text-xl font-semibold">{study.targetProfile.jobTitle}</h1>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <div>
          <dt className="inline font-medium">Industry: </dt>
          <dd className="inline">{study.targetProfile.industry}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Seniority: </dt>
          <dd className="inline">{study.targetProfile.seniority}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Experience: </dt>
          <dd className="inline">{study.targetProfile.yearsOfExperience}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Status: </dt>
          <dd className="inline">{study.status}</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline font-medium">Responsibility: </dt>
          <dd className="inline">{study.targetProfile.responsibility}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <StudyLink linkToken={study.linkToken} />
      </div>

      <section className="mt-8">
        <h2 className="font-semibold">Interviews</h2>
        {sortedInterviews.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No one has started an interview for this study yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {sortedInterviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={`/dashboard/studies/${study.id}/interviews/${interview.id}`}
                  className="flex items-center justify-between py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div>
                    <p className="font-medium">{interview.firstName}</p>
                    {interview.roleDescription && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {interview.roleDescription}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[interview.status] ?? ""}`}
                    >
                      {interview.status}
                    </span>
                    <span className="text-neutral-400">
                      {interview.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Study report</h2>
        {report ? (
          <div className="mt-3">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Version {report.version} · generated {report.generatedAt.toLocaleString()} ·{" "}
              <a href={`/api/studies/${study.id}/report`} className="underline hover:no-underline">
                Download .md
              </a>
            </p>
            <ul className="mt-3 space-y-4">
              {report.themes.map((theme) => (
                <li
                  key={theme.theme}
                  className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <p className="font-medium">{theme.theme}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {theme.participantCount} participant{theme.participantCount === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {theme.representativeQuotes.map((quote) => (
                      <li key={quote}>&quot;{quote}&quot;</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No report generated yet.
          </p>
        )}
        <div className="mt-4">
          <GenerateReportButton studyId={study.id} />
        </div>
      </section>
    </div>
  );
}
