import Link from "next/link";
import { StudyReportThemes } from "@/app/dashboard/studies/[studyId]/study-report-themes";
import { formatDuration } from "@/lib/format-duration";
import { requireViewerStudy } from "../../viewer-data";

/** Read-only study view: its goals and questions, the latest report, and its completed interviews. */
export default async function ViewerStudyPage({ params }: { params: { studyId: string } }) {
  const { study, interviews, report } = await requireViewerStudy(params.studyId);

  return (
    <div>
      <Link
        href="/viewer"
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
      <dl className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <div>
          <dt className="inline font-medium">Description: </dt>
          <dd className="inline">{study.description || "No description yet"}</dd>
        </div>
        {study.researchTopic && (
          <div>
            <dt className="inline font-medium">Research focus: </dt>
            <dd className="inline">{study.researchTopic}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">Status: </dt>
          <dd className="inline">{study.status}</dd>
        </div>
      </dl>

      {(study.preInterviewQuestions.length > 0 || study.feedbackQuestions.length > 0) && (
        <section className="mt-6">
          <h2 className="font-semibold">Questions</h2>
          {study.type === "feedback" ? (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {study.feedbackQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              {study.preInterviewQuestions.map((question) => (
                <li key={question.id}>
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">
                    {question.label}
                  </p>
                  <p>{question.options.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">Interviews</h2>
        {interviews.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No completed interviews yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={`/viewer/studies/${study.id}/interviews/${interview.id}`}
                  className="flex items-center justify-between py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div>
                    <p className="font-medium">{interview.label}</p>
                    {interview.roleDescription && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {interview.roleDescription}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                    <span>{interview.mode === "text" ? "Typed" : "Voice"}</span>
                    {interview.durationSeconds !== null && (
                      <span>{formatDuration(interview.durationSeconds)}</span>
                    )}
                    <span>{new Date(interview.createdAt).toLocaleDateString()}</span>
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
              Version {report.version} · generated {new Date(report.generatedAt).toLocaleString()}
            </p>
            {report.type === "feedback" ? (
              <>
                <StudyReportThemes title="What worked well" themes={report.whatWorkedWell} />
                <StudyReportThemes
                  title="What could be improved"
                  themes={report.whatCouldBeImproved}
                />
                <StudyReportThemes
                  title="Topics for future sessions"
                  themes={report.topicsForFuture}
                />
                <StudyReportThemes title="Other insights" themes={report.otherInsights} />
              </>
            ) : (
              <StudyReportThemes themes={report.themes} />
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No report generated yet.
          </p>
        )}
      </section>
    </div>
  );
}
