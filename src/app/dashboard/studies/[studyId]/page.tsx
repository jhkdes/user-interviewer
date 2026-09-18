import Link from "next/link";
import { notFound } from "next/navigation";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getStudyReportRepository } from "@/repositories/get-study-report-repository";
import { getLinkExpiryInfo } from "@/study-service";
import { StudyLink } from "../../study-link";
import { ExtendLinkButton } from "./extend-link-button";
import { GenerateReportButton } from "./generate-report-button";
import { RemoveStudyButton } from "./remove-study-button";

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
  const linkExpiry = getLinkExpiryInfo(study);

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

      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{study.title || "(untitled study)"}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-sm capitalize text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {study.type}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <div className="col-span-2">
          <dt className="inline font-medium">Description: </dt>
          <dd className="inline">{study.description || "No description yet"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Status: </dt>
          <dd className="inline">{study.status}</dd>
        </div>
        <div>
          {study.type === "feedback" ? (
            <>
              <dt className="inline font-medium">Feedback questions: </dt>
              <dd className="inline">{study.feedbackQuestions.length}</dd>
            </>
          ) : (
            <>
              <dt className="inline font-medium">Pre-interview questions: </dt>
              <dd className="inline">{study.preInterviewQuestions.length}</dd>
            </>
          )}
        </div>
      </dl>
      <Link
        href={`/dashboard/studies/${study.id}/edit-questions`}
        className="mt-2 inline-block text-sm underline hover:no-underline"
      >
        Edit questions →
      </Link>

      <div className="mt-4">
        <StudyLink linkToken={study.linkToken} />
        {linkExpiry.expiresAt && (
          <p
            className={
              linkExpiry.validity === "expired"
                ? "mt-2 text-sm text-red-600 dark:text-red-400"
                : linkExpiry.isExpiringSoon
                  ? "mt-2 text-sm text-amber-600 dark:text-amber-400"
                  : "mt-2 text-sm text-neutral-500 dark:text-neutral-400"
            }
          >
            {linkExpiry.validity === "expired"
              ? `This link expired on ${linkExpiry.expiresAt.toLocaleDateString()}. Extend it to let participants use it again.`
              : linkExpiry.isExpiringSoon
                ? `Link expires in ${linkExpiry.daysRemaining} day${linkExpiry.daysRemaining === 1 ? "" : "s"}, on ${linkExpiry.expiresAt.toLocaleDateString()} — extend it soon to keep it active.`
                : `Link expires ${linkExpiry.expiresAt.toLocaleDateString()} (in ${linkExpiry.daysRemaining} days).`}
          </p>
        )}
        {study.status !== "closed" && (
          <div className="mt-2">
            <ExtendLinkButton studyId={study.id} />
          </div>
        )}
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
                    {interview.trackingId && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        Tracking id: {interview.trackingId}
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
        {study.type === "feedback" ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Cross-participant study reports aren&apos;t available for feedback studies yet — see
            each interview&apos;s individual summary instead.
          </p>
        ) : report ? (
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
        {study.type !== "feedback" && (
          <div className="mt-4">
            <GenerateReportButton studyId={study.id} />
          </div>
        )}
      </section>

      <RemoveStudyButton studyId={study.id} studyTitle={study.title} />
    </div>
  );
}
