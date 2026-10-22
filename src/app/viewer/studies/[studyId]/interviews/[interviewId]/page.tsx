import Link from "next/link";
import { notFound } from "next/navigation";
import { InterviewRecordingAndTranscript } from "@/app/dashboard/studies/[studyId]/interviews/[interviewId]/interview-recording-and-transcript";
import { SummarySections } from "@/app/dashboard/summary-sections";
import { formatDuration } from "@/lib/format-duration";
import { requireViewerStudy } from "../../../../viewer-data";

/** Read-only interview view: audio, transcript and summary, under a participant number rather than a name. */
export default async function ViewerInterviewPage({
  params,
}: {
  params: { studyId: string; interviewId: string };
}) {
  const { interviews } = await requireViewerStudy(params.studyId);
  const interview = interviews.find((i) => i.id === params.interviewId);
  if (!interview) notFound();

  return (
    <div>
      <Link
        href={`/viewer/studies/${params.studyId}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to study
      </Link>

      <h1 className="mt-2 text-xl font-semibold">{interview.label}</h1>
      {interview.roleDescription && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {interview.roleDescription}
        </p>
      )}
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {interview.mode === "text" ? "Typed interview" : "Voice interview"}
        {interview.durationSeconds !== null &&
          ` · duration ${formatDuration(interview.durationSeconds)}`}
        {interview.completedAt &&
          ` · completed ${new Date(interview.completedAt).toLocaleString()}`}
      </p>

      <InterviewRecordingAndTranscript
        recordingUrl={interview.hasRecording ? `/api/interviews/${interview.id}/recording` : null}
        showRecording={interview.mode !== "text"}
        transcript={interview.transcript}
        participantName={interview.label}
      />

      <section className="mt-6">
        <h2 className="font-semibold">Summary</h2>
        <SummarySections summary={interview.summary} />
      </section>
    </div>
  );
}
