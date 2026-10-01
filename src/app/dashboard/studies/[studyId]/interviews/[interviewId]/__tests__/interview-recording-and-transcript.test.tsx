// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranscriptEntry } from "@/domain";
import { InterviewRecordingAndTranscript } from "../interview-recording-and-transcript";

const transcript: TranscriptEntry[] = [
  { speaker: "interviewer", text: "Hi Jordan, tell me about your day.", timestampMs: 0 },
  { speaker: "participant", text: "It was a busy one.", timestampMs: 65_000 },
];

afterEach(() => {
  cleanup();
});

describe("InterviewRecordingAndTranscript", () => {
  it("shows 'No recording available' when there's no recording URL", () => {
    render(
      <InterviewRecordingAndTranscript
        recordingUrl={null}
        transcript={transcript}
        participantName="Jordan"
      />,
    );

    expect(screen.getByText("No recording available.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows 'No transcript available yet' when there's no transcript", () => {
    render(
      <InterviewRecordingAndTranscript
        recordingUrl={null}
        transcript={null}
        participantName="Jordan"
      />,
    );

    expect(screen.getByText("No transcript available yet.")).toBeInTheDocument();
  });

  it("renders each turn's speaker, text, and a formatted timestamp", () => {
    render(
      <InterviewRecordingAndTranscript
        recordingUrl="https://example.com/recording.mp3"
        transcript={transcript}
        participantName="Jordan"
      />,
    );

    expect(screen.getByText("Hi Jordan, tell me about your day.")).toBeInTheDocument();
    expect(screen.getByText("It was a busy one.")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("renders timestamps as plain text (not clickable) when there's no recording", () => {
    render(
      <InterviewRecordingAndTranscript
        recordingUrl={null}
        transcript={transcript}
        participantName="Jordan"
      />,
    );

    expect(screen.queryByRole("button", { name: "0:00" })).not.toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("seeks the audio element and plays when a timestamp is clicked", async () => {
    const user = userEvent.setup();
    const playSpy = vi.fn().mockResolvedValue(undefined);
    // jsdom doesn't implement HTMLMediaElement.play/pause — stub them so the
    // click handler's audio.play() call doesn't throw.
    window.HTMLMediaElement.prototype.play = playSpy;
    window.HTMLMediaElement.prototype.pause = vi.fn();

    render(
      <InterviewRecordingAndTranscript
        recordingUrl="https://example.com/recording.mp3"
        transcript={transcript}
        participantName="Jordan"
      />,
    );

    const audio = document.querySelector("audio") as HTMLAudioElement;
    await user.click(screen.getByRole("button", { name: "1:05" }));

    expect(audio.currentTime).toBe(65);
    expect(playSpy).toHaveBeenCalled();
  });
});
