import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFreshRecordingUrl } from "@/lib/vapi/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { RemoveInterviewButton } from "./remove-interview-button";

/** Interview detail (T10.4): transcript, individual summary, audio player. */
export default async function InterviewDetailPage({
  params,
}: {
  params: { studyId: string; interviewId: string };
}) {
  const interview = await getInterviewRepository().getById(params.interviewId);
  // Guards against a stale/tampered URL pointing at an interview from a
  // different study, not just a missing id.
  if (!interview || interview.studyId !== params.studyId) notFound();

  const summary = await getSummaryRepository().getByInterviewId(interview.id);
  // The URL captured at end-of-call-report time isn't reliably playable
  // (Vapi's HIPAA-compliant storage requires signed requests) and a presigned
  // one expires ~33 min after the call — so a fresh one is fetched on every
  // view instead of relying on anything stored. `recordingUrl` remains as a
  // fallback for interviews recorded before `vapiCallId` was captured.
  const playableRecordingUrl = interview.vapiCallId
    ? await fetchFreshRecordingUrl(interview.vapiCallId)
    : interview.recordingUrl;

  return (
    <div>
      <Link
        href={`/dashboard/studies/${params.studyId}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to study
      </Link>

      <h1 className="mt-2 text-xl font-semibold">{interview.firstName}</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {interview.email}
        {interview.roleDescription && ` · ${interview.roleDescription}`}
      </p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Status: {interview.status}
        {interview.completedAt && ` · completed ${interview.completedAt.toLocaleString()}`}
      </p>

      <section className="mt-6">
        <h2 className="font-semibold">Recording</h2>
        {playableRecordingUrl ? (
          <audio controls src={playableRecordingUrl} className="mt-2 w-full" />
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No recording available.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        {summary ? (
          <div className="mt-2 space-y-4 text-sm">
            <div>
              <p className="font-medium">Pain points</p>
              <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
                {summary.painPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Notable quotes</p>
              <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
                {summary.notableQuotes.map((quote) => (
                  <li key={quote}>&quot;{quote}&quot;</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Takeaways</p>
              <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
                {summary.takeaways.map((takeaway) => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No summary available yet.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Transcript</h2>
        {interview.transcript && interview.transcript.length > 0 ? (
          <ol className="mt-2 space-y-2 text-sm">
            {interview.transcript.map((entry, i) => (
              <li key={i}>
                <span className="font-medium">
                  {entry.speaker === "interviewer" ? "Interviewer" : interview.firstName}:
                </span>{" "}
                {entry.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No transcript available yet.
          </p>
        )}
      </section>

      <RemoveInterviewButton studyId={params.studyId} interviewId={interview.id} />
    </div>
  );
}
