// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { InterviewFlow } from "../interview-flow";

// The intake form, the microphone check and the call have their own tests;
// here they are stand-ins so these tests are about the order of the screens.
vi.mock("../intake-form", () => ({
  IntakeForm: ({
    onSubmitted,
    onStarted,
  }: {
    onSubmitted?: (submission: unknown) => void;
    onStarted: (interview: Interview) => void;
  }) => (
    <button
      onClick={() => {
        onSubmitted?.({ firstName: "Sam" });
        onStarted({
          id: "interview-1",
          firstName: "Sam",
          voiceProvider: "elevenlabs",
        } as Interview);
      }}
    >
      Submit intake
    </button>
  ),
}));
vi.mock("../mic-check-screen", () => ({
  MicCheckScreen: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Mic is fine</button>
  ),
}));
vi.mock("../live-call", () => ({
  LiveCall: ({
    interviewId,
    onEnded,
  }: {
    interviewId: string;
    onEnded: (info?: { participantTurns: number; reason: string }) => void;
  }) => (
    <div>
      <p>Voice call {interviewId}</p>
      <button onClick={() => onEnded({ participantTurns: 1, reason: "user" })}>Leave early</button>
    </div>
  ),
}));

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const study = {
  type: "discovery" as const,
  title: "How Job Seekers Get Interviews",
  description: "how you search",
  questions: [],
};

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, userAgent: DESKTOP_UA });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("the microphone check in the interview flow", () => {
  it("comes between the intake form and the voice call", async () => {
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="token-1" {...study} />);
    await user.click(await screen.findByRole("button", { name: "Start the interview" }));
    await user.click(screen.getByRole("button", { name: "Submit intake" }));

    expect(screen.getByRole("button", { name: "Mic is fine" })).toBeInTheDocument();
    expect(screen.queryByText("Voice call interview-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mic is fine" }));
    expect(screen.getByText("Voice call interview-1")).toBeInTheDocument();
  });

  it("is checked again when the participant starts over after a call that ended early", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "interview-2", firstName: "Sam", voiceProvider: "elevenlabs" }),
      }),
    );
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="token-1" {...study} />);
    await user.click(await screen.findByRole("button", { name: "Start the interview" }));
    await user.click(screen.getByRole("button", { name: "Submit intake" }));
    await user.click(screen.getByRole("button", { name: "Mic is fine" }));
    await user.click(screen.getByRole("button", { name: "Leave early" }));

    await user.click(screen.getByRole("button", { name: "Start again" }));

    expect(await screen.findByRole("button", { name: "Mic is fine" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mic is fine" }));
    expect(screen.getByText("Voice call interview-2")).toBeInTheDocument();
  });
});
