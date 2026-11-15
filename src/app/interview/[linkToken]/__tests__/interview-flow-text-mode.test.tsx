// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { InterviewFlow } from "../interview-flow";
import { jsonResponse, makeState, stateMessages } from "./text-test-utils";

// The intake form, the voice call, and the chat have their own tests; here
// they are stand-ins so these tests are about which screen the flow shows.
vi.mock("../intake-form", () => ({
  IntakeForm: ({ onStarted }: { onStarted: (interview: Interview) => void }) => (
    <button
      onClick={() =>
        onStarted({
          id: "interview-1",
          firstName: "Sam",
          voiceProvider: "vapi",
        } as Interview)
      }
    >
      Submit intake
    </button>
  ),
}));
const liveCallMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("../live-call", async () => {
  const { useRef } = await import("react");
  return {
    LiveCall: ({
      interviewId,
      onSwitchedToTyping,
      onRetry,
    }: {
      interviewId: string;
      onSwitchedToTyping?: () => void;
      onRetry?: () => void;
    }) => {
      // Counts how many times the call was (re)mounted.
      const attempt = useRef(++liveCallMounts.count).current;
      return (
        <div>
          <p>
            Voice call {interviewId} attempt {attempt}
          </p>
          {onSwitchedToTyping && <button onClick={onSwitchedToTyping}>Restart from call</button>}
          {onRetry && <button onClick={onRetry}>Retry call</button>}
        </div>
      );
    },
  };
});
vi.mock("../text-chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("../text-chat")>();
  return {
    ...original,
    TextChat: ({
      interviewId,
      initialMessages,
      onEnded,
    }: {
      interviewId: string;
      initialMessages: { text: string }[];
      onEnded: (reason: string | null) => void;
    }) => (
      <div>
        <p>
          Chat {interviewId} with {initialMessages.length} saved messages
        </p>
        {initialMessages.map((m) => (
          <p key={m.text}>{m.text}</p>
        ))}
        <button onClick={() => onEnded("text-interview-ended")}>Finish chat</button>
        <button onClick={() => onEnded("participant-inactive")}>Time out chat</button>
        <button onClick={() => onEnded("time-cap")}>Cap chat</button>
      </div>
    ),
  };
});

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function stubUserAgent(userAgent: string) {
  vi.stubGlobal("navigator", { ...navigator, userAgent });
}

const feedbackStudy = {
  type: "feedback" as const,
  title: "Post-webinar feedback",
  description: "today's onboarding webinar",
  questions: [],
};
const discoveryStudy = { ...feedbackStudy, type: "discovery" as const, title: "AI in a PM's day" };

const SAVED_KEY = "interview:token-1";

beforeEach(() => {
  liveCallMounts.count = 0;
  stubUserAgent(DESKTOP_UA);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

/** Routes fetches: the text-state answer is configurable. */
function stubFetch(handlers: { textState?: () => Response }) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/text-state")) {
      if (!handlers.textState) throw new Error("unexpected text-state call");
      return handlers.textState();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

async function startAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Start" }));
  await user.click(await screen.findByRole("button", { name: "Submit intake" }));
}

describe("InterviewFlow: a feedback study's two links", () => {
  describe("the voice link", () => {
    it.each([false, true])(
      "goes straight from intake to the voice call, with no typing option and no resume check (text mode %s)",
      async (textModeEnabled) => {
        const fetchSpy = stubFetch({});
        const user = userEvent.setup();
        render(
          <InterviewFlow
            linkToken="token-1"
            {...feedbackStudy}
            textModeEnabled={textModeEnabled}
          />,
        );

        await startAndSubmit(user);

        expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
        expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
        expect(screen.queryByText("Restart from call")).not.toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it("ignores a saved interview id and shows voice-only intro wording, even with text mode on", async () => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-9" }));
      const fetchSpy = stubFetch({});
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Voice, not text")).toBeInTheDocument();
      expect(screen.queryByText(/typing|type if you prefer/i)).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("lets the participant retry a failed call when text mode is on, and never offers typing", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);
      await startAndSubmit(user);

      expect(await screen.findByText(/attempt 1/)).toBeInTheDocument();
      expect(screen.queryByText("Restart from call")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry call" }));
      expect(await screen.findByText(/attempt 2/)).toBeInTheDocument();
    });

    it("offers no retry when text mode is off", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} />);
      await startAndSubmit(user);

      expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry call" })).not.toBeInTheDocument();
    });
  });

  describe("the text link", () => {
    it("shows the written-chat intro, then goes from intake straight into a chat", async () => {
      const fetchSpy = stubFetch({
        textState: () => jsonResponse(makeState({})),
      });
      const user = userEvent.setup();
      render(
        <InterviewFlow linkToken="token-1" {...feedbackStudy} channel="text" textModeEnabled />,
      );

      expect(await screen.findByText("Typed chat, not voice")).toBeInTheDocument();
      expect(screen.queryByText("Voice, not text")).not.toBeInTheDocument();
      await startAndSubmit(user);

      expect(await screen.findByText("Chat interview-1 with 0 saved messages")).toBeInTheDocument();
      expect(screen.queryByText(/Voice call/)).not.toBeInTheDocument();
      expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null")).toMatchObject({
        interviewId: "interview-1",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("shows the thank-you screen, not the discovery session-ended screen, at the time cap", async () => {
      stubFetch({ textState: () => jsonResponse(makeState({})) });
      const user = userEvent.setup();
      render(
        <InterviewFlow linkToken="token-1" {...feedbackStudy} channel="text" textModeEnabled />,
      );
      await startAndSubmit(user);

      await user.click(await screen.findByRole("button", { name: "Cap chat" }));

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
      expect(screen.queryByText("This session has ended")).not.toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("shows the inactivity screen when the chat reports it timed out", async () => {
      stubFetch({ textState: () => jsonResponse(makeState({})) });
      const user = userEvent.setup();
      render(
        <InterviewFlow linkToken="token-1" {...feedbackStudy} channel="text" textModeEnabled />,
      );
      await startAndSubmit(user);

      await user.click(await screen.findByRole("button", { name: "Time out chat" }));

      expect(await screen.findByText(/shared so far has been saved/)).toBeInTheDocument();
    });

    it("goes straight back into a saved chat, skipping intro and intake", async () => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-1" }));
      const fetchSpy = stubFetch({
        textState: () =>
          jsonResponse(
            makeState({
              messages: stateMessages(["interviewer", "Hi Sam!"], ["participant", "Hello"]),
            }),
          ),
      });
      render(
        <InterviewFlow linkToken="token-1" {...feedbackStudy} channel="text" textModeEnabled />,
      );

      expect(await screen.findByText("Chat interview-1 with 2 saved messages")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
      expect(fetchSpy.mock.calls[0][0]).toBe(
        "/api/interviews/interview-1/text-state?linkToken=token-1",
      );
    });
  });

  describe("a discovery study is unchanged", () => {
    it("keeps its voice link voice-only, even with text mode on", async () => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-9" }));
      const fetchSpy = stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...discoveryStudy} textModeEnabled />);

      await user.click(await screen.findByRole("button", { name: "Start the interview" }));
      await user.click(await screen.findByRole("button", { name: "Submit intake" }));

      expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
