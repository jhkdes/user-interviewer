import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFreshRecordingUrl } from "@/lib/vapi/client";
import { formatDuration } from "@/lib/format-duration";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { ScreenerAnswers } from "@/app/dashboard/screener-answers";
import { describeCallEnd } from "@/app/dashboard/call-end-label";
import { EndCauseBadge } from "@/app/dashboard/end-cause-badge";
import { InterviewModeBadge } from "@/app/dashboard/interview-mode-badge";
import { SummarySections } from "@/app/dashboard/summary-sections";
import { describeTextEndedReason } from "./ended-reason-label";
import { InterviewRecordingAndTranscript } from "./interview-recording-and-transcript";
import { getPlayableRecordingUrl } from "./playable-recording-url";
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

  const [summary, study] = await Promise.all([
    getSummaryRepository().getByInterviewId(interview.id),
    getStudyRepository().getById(interview.studyId),
  ]);
  // A typed interview has no audio, so this never reaches a voice provider
  // for one — see getPlayableRecordingUrl.
  const isTyped = interview.mode === "text";
  const playableRecordingUrl = await getPlayableRecordingUrl(interview, fetchFreshRecordingUrl);
  const typedEndReason = isTyped ? describeTextEndedReason(interview.endedReason) : null;
  const callEnd = isTyped ? null : describeCallEnd(interview);

  const durationSeconds =
    interview.startedAt && interview.completedAt
      ? Math.round((interview.completedAt.getTime() - interview.startedAt.getTime()) / 1000)
      : null;

  return (
    <div>
      <Link
        href={`/dashboard/studies/${params.studyId}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to study
      </Link>

      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{interview.firstName}</h1>
        <span className="text-sm">
          <InterviewModeBadge interview={interview} />
          <EndCauseBadge interview={interview} />
        </span>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {interview.email}
        {interview.roleDescription && ` · ${interview.roleDescription}`}
        {interview.trackingId && ` · tracking id: ${interview.trackingId}`}
      </p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Status: {interview.status}
        {durationSeconds !== null && ` · duration ${formatDuration(durationSeconds)}`}
        {interview.completedAt && ` · completed ${interview.completedAt.toLocaleString()}`}
        {typedEndReason && ` · ended: ${typedEndReason}`}
        {callEnd && ` · ended: ${callEnd}`}
      </p>

      <ScreenerAnswers
        questions={study?.preInterviewQuestions ?? []}
        answers={interview.screenerAnswers}
      />

      <InterviewRecordingAndTranscript
        recordingUrl={playableRecordingUrl}
        showRecording={!isTyped}
        transcript={interview.transcript}
        participantName={interview.firstName}
      />

      <section className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        <SummarySections summary={summary} />
      </section>

      {interview.status === "completed" &&
        interview.transcript &&
        interview.transcript.length > 0 && (
          <p className="mt-6 text-sm">
            <Link
              href={`/dashboard/studies/${params.studyId}/interviews/${interview.id}/export`}
              className="underline hover:no-underline"
            >
              {interview.redactedAt ? "View exported report →" : "Export report →"}
            </Link>
          </p>
        )}

      <RemoveInterviewButton studyId={params.studyId} interviewId={interview.id} />
    </div>
  );
}
