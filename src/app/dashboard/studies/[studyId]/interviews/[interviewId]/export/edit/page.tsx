import Link from "next/link";
import { notFound } from "next/navigation";
import { autoRedactTranscript } from "@/interview-export-service";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { RedactedTranscriptEditor } from "./redacted-transcript-editor";

/**
 * Step one of the printable interview export flow: shows the PM an
 * auto-redacted (or previously saved) copy of the transcript, editable
 * per-turn, before anything can be printed/shared — see
 * interview-export-service/redact-transcript.ts for what the automatic pass
 * does and doesn't catch.
 */
export default async function ExportEditPage({
  params,
}: {
  params: { studyId: string; interviewId: string };
}) {
  const interview = await getInterviewRepository().getById(params.interviewId);
  if (!interview || interview.studyId !== params.studyId) notFound();

  if (!interview.transcript || interview.transcript.length === 0) {
    return (
      <div>
        <Link
          href={`/dashboard/studies/${params.studyId}/interviews/${interview.id}`}
          className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
        >
          ← Back to interview
        </Link>
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          No transcript to export yet.
        </p>
      </div>
    );
  }

  const speakers = interview.transcript.map((entry) => entry.speaker);
  const initialTexts = (
    interview.redactedTranscript ?? autoRedactTranscript(interview.transcript, interview.firstName)
  ).map((entry) => entry.text);
  const autoRedactedTexts = autoRedactTranscript(interview.transcript, interview.firstName).map(
    (entry) => entry.text,
  );

  return (
    <div>
      <Link
        href={`/dashboard/studies/${params.studyId}/interviews/${interview.id}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to interview
      </Link>

      <h1 className="mt-2 text-xl font-semibold">Review redacted transcript</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        The participant&apos;s name and any email address have already been replaced below. Check
        for anything else that could identify them — company names, other people mentioned, phone
        numbers, etc. — and edit any line before saving.
      </p>

      <div className="mt-6">
        <RedactedTranscriptEditor
          studyId={params.studyId}
          interviewId={interview.id}
          speakers={speakers}
          initialTexts={initialTexts}
          autoRedactedTexts={autoRedactedTexts}
        />
      </div>
    </div>
  );
}
