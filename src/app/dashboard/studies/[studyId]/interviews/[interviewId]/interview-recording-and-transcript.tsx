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
  showRecording = true,
}: {
  recordingUrl: string | null;
  transcript: TranscriptEntry[] | null;
  participantName: string;
  /** False for a typed interview, which has no audio: the Recording section is left out entirely rather than saying "No recording available". */
  showRecording?: boolean;
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
      {showRecording && (
        // With a recording, this stays pinned to the top of the window while the
        // transcript scrolls, so the player is always there to pause or seek.
        // The negative margin and matching padding stretch its background across
        // the page's side padding so transcript text can't show through the edges.
        <section
          className={
            recordingUrl
              ? "sticky top-0 z-10 -mx-6 mt-6 border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-950"
              : "mt-6"
          }
        >
          <h2 className="font-semibold">Recording</h2>
          {recordingUrl ? (
            <audio ref={audioRef} controls src={recordingUrl} className="mt-2 w-full" />
          ) : (
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              No recording available.
            </p>
          )}
        </section>
      )}

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
