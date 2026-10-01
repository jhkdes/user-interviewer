"use client";

import { useRef } from "react";
import type { TranscriptEntry } from "@/domain";
import { formatDuration } from "@/lib/format-duration";

/**
 * Renders the Recording and Transcript sections together — merged into one
 * client component (rather than two separate server-rendered sections, as
 * before) because clicking a transcript line's timestamp needs to seek the
 * very same `<audio>` element the Recording section renders, which requires
 * a shared ref.
 */
export function InterviewRecordingAndTranscript({
  recordingUrl,
  transcript,
  participantName,
}: {
  recordingUrl: string | null;
  transcript: TranscriptEntry[] | null;
  participantName: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  function seekTo(timestampMs: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = timestampMs / 1000;
    audio.play().catch(() => {
      // Autoplay can be blocked by the browser until it's seen a user
      // gesture — the click that triggered this already counts as one, so
      // this is just a defensive no-op for the rare case it's still refused.
    });
  }

  return (
    <>
      <section className="mt-6">
        <h2 className="font-semibold">Recording</h2>
        {recordingUrl ? (
          <audio ref={audioRef} controls src={recordingUrl} className="mt-2 w-full" />
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No recording available.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Transcript</h2>
        {transcript && transcript.length > 0 ? (
          <ol className="mt-2 space-y-2 text-sm">
            {transcript.map((entry, i) => (
              <li key={i}>
                {recordingUrl ? (
                  <button
                    type="button"
                    onClick={() => seekTo(entry.timestampMs)}
                    title="Play the recording from here"
                    className="font-mono text-xs text-neutral-400 underline hover:no-underline dark:text-neutral-500"
                  >
                    {formatDuration(entry.timestampMs / 1000)}
                  </button>
                ) : (
                  <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                    {formatDuration(entry.timestampMs / 1000)}
                  </span>
                )}{" "}
                <span className="font-medium">
                  {entry.speaker === "interviewer" ? "Interviewer" : participantName}:
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
    </>
  );
}
