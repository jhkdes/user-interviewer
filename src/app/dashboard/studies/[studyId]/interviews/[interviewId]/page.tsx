import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFreshRecordingUrl } from "@/lib/vapi/client";
import { formatDuration } from "@/lib/format-duration";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { SummarySections } from "@/app/dashboard/summary-sections";
import { InterviewRecordingAndTranscript } from "./interview-recording-and-transcript";
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
  // Vapi's presigned recording URL expires ~33 min after the call, so a
  // fresh one is fetched on every view rather than relying on anything
  // stored. ElevenLabs recordings are fetched on demand too, via a proxy
  // route (see src/app/api/interviews/[id]/recording/route.ts) rather than
  // a direct URL, since ElevenLabs' audio API needs a server-side API key
  // header a plain `<audio src>` can't attach. `recordingUrl` remains as a
  // fallback for interviews recorded before `vapiCallId` was captured.
  const playableRecordingUrl =
    interview.voiceProvider === "elevenlabs"
      ? interview.elevenLabsConversationId
        ? `/api/interviews/${interview.id}/recording`
        : null
      : interview.vapiCallId
        ? await fetchFreshRecordingUrl(interview.vapiCallId)
        : interview.recordingUrl;

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

      <h1 className="mt-2 text-xl font-semibold">{interview.firstName}</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {interview.email}
        {interview.roleDescription && ` · ${interview.roleDescription}`}
        {interview.trackingId && ` · tracking id: ${interview.trackingId}`}
      </p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Status: {interview.status}
        {durationSeconds !== null && ` · duration ${formatDuration(durationSeconds)}`}
        {interview.completedAt && ` · completed ${interview.completedAt.toLocaleString()}`}
      </p>

      <InterviewRecordingAndTranscript
        recordingUrl={playableRecordingUrl}
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
