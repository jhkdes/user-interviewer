import { notFound, redirect } from "next/navigation";
import { SummarySections } from "@/app/dashboard/summary-sections";
import { resolveScreenerAnswers } from "@/interview-export-service";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { PrintButton } from "./print-button";

/**
 * The printable interview export — a PM prints this to PDF (or saves it as
 * one via the browser) and sends the file themselves; there's no shareable
 * link, password, or expiry, since the content is static once the interview
 * is complete. Deliberately omits the participant's name, email, and any
 * third-party tracking id (the interview's own internal `id` is shown
 * instead — see the design conversation this was built from) — only
 * `redactedTranscript` is ever rendered here, never the raw `transcript`.
 */
export default async function InterviewExportPage({
  params,
}: {
  params: { studyId: string; interviewId: string };
}) {
  const interview = await getInterviewRepository().getById(params.interviewId);
  if (!interview || interview.studyId !== params.studyId) notFound();

  // Must be reviewed/saved at least once before it can be printed — see
  // the edit page, which is where `redactedTranscript` first gets set.
  if (!interview.redactedTranscript) {
    redirect(`/dashboard/studies/${params.studyId}/interviews/${interview.id}/export/edit`);
  }

  const [study, summary] = await Promise.all([
    getStudyRepository().getById(params.studyId),
    getSummaryRepository().getByInterviewId(interview.id),
  ]);
  if (!study) notFound();

  const screenerAnswers = resolveScreenerAnswers(study, interview);

  return (
    <div>
      <PrintButton
        editHref={`/dashboard/studies/${params.studyId}/interviews/${interview.id}/export/edit`}
      />

      <h1 className="text-xl font-semibold">{study.title} — Interview Report</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {interview.createdAt.toLocaleDateString()} · interview id: {interview.id}
        {interview.roleDescription && ` · ${interview.roleDescription}`}
      </p>
      {study.description && (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{study.description}</p>
      )}

      {study.type === "feedback" && study.feedbackQuestions.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Questions asked</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {study.feedbackQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {study.type === "discovery" && study.researchTopic && (
        <section className="mt-6">
          <h2 className="font-semibold">Research focus</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {study.researchTopic}
          </p>
        </section>
      )}

      {screenerAnswers.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Pre-interview questions</h2>
          <dl className="mt-2 space-y-2 text-sm">
            {screenerAnswers.map(({ label, answer }) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd className="text-neutral-600 dark:text-neutral-400">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        <SummarySections summary={summary} />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Transcript</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {interview.redactedTranscript.map((entry, i) => (
            <li key={i}>
              <span className="font-medium">
                {entry.speaker === "interviewer" ? "Interviewer" : "Participant"}:
              </span>{" "}
              {entry.text}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
