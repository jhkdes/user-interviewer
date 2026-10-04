// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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

/** Routes fetches: start-text and text-state answers are configurable. */
function stubFetch(handlers: { startText?: () => Response; textState?: () => Response }) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/start-text")) {
      return handlers.startText ? handlers.startText() : jsonResponse({ mode: "text" });
    }
    if (url.includes("/text-state")) {
      if (!handlers.textState) throw new Error("unexpected text-state call");
      return handlers.textState();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

async function goToModeSelect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Start" }));
  await user.click(await screen.findByRole("button", { name: "Submit intake" }));
}

describe("InterviewFlow with text mode", () => {
  describe("when text mode is off (the default)", () => {
    it("goes straight from intake to the voice call, with no mode screen and no resume check", async () => {
      const fetchSpy = stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} />);

      await goToModeSelect(user);

      expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
      expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("ignores a saved interview id", async () => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-9" }));
      const fetchSpy = stubFetch({});
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} />);

      expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("keeps the voice-only intro copy", async () => {
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} />);

      expect(await screen.findByText("Voice, not text")).toBeInTheDocument();
      expect(screen.queryByText(/switch to typing/i)).not.toBeInTheDocument();
    });
  });

  describe("discovery studies stay voice-only", () => {
    it("never shows the mode screen or checks for a saved chat, even with the flag on", async () => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-9" }));
      const fetchSpy = stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...discoveryStudy} textModeEnabled />);

      await user.click(await screen.findByRole("button", { name: /start/i }));
      await user.click(await screen.findByRole("button", { name: "Submit intake" }));

      expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
      expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("feedback studies with text mode on", () => {
    it("tells the participant about the typing option in the intro", async () => {
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Voice, or type if you prefer")).toBeInTheDocument();
      expect(screen.getByText(/saved as a transcript/)).toBeInTheDocument();
    });

    it("shows the countdown screen after intake and starts the voice call with Start now", async () => {
      stubFetch({ textState: () => jsonResponse({}, 404) });
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      await goToModeSelect(user);
      expect(await screen.findByText("Ready when you are")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Start now" }));

      expect(await screen.findByText(/Voice call interview-1/)).toBeInTheDocument();
    });

    it("switches the interview to typing, remembers it, and opens an empty chat", async () => {
      const fetchSpy = stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      expect(await screen.findByText("Chat interview-1 with 0 saved messages")).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledWith("/api/interviews/interview-1/start-text", {
        method: "POST",
      });
      expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "")).toEqual({
        interviewId: "interview-1",
      });
    });

    it("stays on the countdown screen, saves nothing, and says so when the switch fails", async () => {
      stubFetch({ startText: () => jsonResponse({ error: { code: "x" } }, 500) });
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't switch to typing/);
      expect(screen.queryByText(/Chat interview-1/)).not.toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("treats a network failure on the switch as a failed switch", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't switch to typing/);
    });

    it("shows the inactivity screen and forgets the interview when the chat reports it timed out", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);
      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      await user.click(await screen.findByRole("button", { name: "Time out chat" }));

      expect(await screen.findByText("This interview ended due to inactivity")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("shows the thank-you screen when the chat ends at the time cap", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);
      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      await user.click(await screen.findByRole("button", { name: "Cap chat" }));

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
    });

    it("clears the remembered interview and shows the thank-you screen when the chat ends", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);
      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: /Switch to typing/ }));

      await user.click(await screen.findByRole("button", { name: "Finish chat" }));

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
      expect(screen.getByText(/chat with us/)).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });
  });

  describe("restarting from the voice call", () => {
    async function intoVoiceCall(
      user: ReturnType<typeof userEvent.setup>,
      props: { textModeEnabled?: boolean; study?: typeof feedbackStudy } = {},
    ) {
      render(
        <InterviewFlow
          linkToken="token-1"
          {...(props.study ?? feedbackStudy)}
          textModeEnabled={props.textModeEnabled ?? true}
        />,
      );
      await goToModeSelect(user);
      await user.click(await screen.findByRole("button", { name: "Start now" }));
      await screen.findByText(/Voice call interview-1/);
    }

    it("offers the restart and a retry on the voice call for a feedback study with text mode on", async () => {
      stubFetch({});
      const user = userEvent.setup();

      await intoVoiceCall(user);

      expect(screen.getByRole("button", { name: "Restart from call" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry call" })).toBeInTheDocument();
    });

    it("offers neither when text mode is off", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} />);
      await user.click(await screen.findByRole("button", { name: "Start" }));
      await user.click(await screen.findByRole("button", { name: "Submit intake" }));

      await screen.findByText(/Voice call interview-1/);

      expect(screen.queryByRole("button", { name: "Restart from call" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry call" })).not.toBeInTheDocument();
    });

    it("offers neither on a discovery study, even with text mode on", async () => {
      stubFetch({});
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...discoveryStudy} textModeEnabled />);
      await user.click(await screen.findByRole("button", { name: /start/i }));
      await user.click(await screen.findByRole("button", { name: "Submit intake" }));

      await screen.findByText(/Voice call interview-1/);

      expect(screen.queryByRole("button", { name: "Restart from call" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry call" })).not.toBeInTheDocument();
    });

    it("opens a fresh typing chat and remembers the interview once the call has been restarted", async () => {
      stubFetch({});
      const user = userEvent.setup();
      await intoVoiceCall(user);

      await user.click(screen.getByRole("button", { name: "Restart from call" }));

      expect(await screen.findByText("Chat interview-1 with 0 saved messages")).toBeInTheDocument();
      expect(screen.queryByText(/Voice call/)).not.toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "")).toEqual({
        interviewId: "interview-1",
      });
    });

    it("ends on the typed thank-you after a restarted interview finishes", async () => {
      stubFetch({});
      const user = userEvent.setup();
      await intoVoiceCall(user);
      await user.click(screen.getByRole("button", { name: "Restart from call" }));

      await user.click(await screen.findByRole("button", { name: "Finish chat" }));

      expect(await screen.findByText(/chat with us/)).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("starts a fresh voice call when the participant retries after an error", async () => {
      stubFetch({});
      const user = userEvent.setup();
      await intoVoiceCall(user);
      expect(screen.getByText("Voice call interview-1 attempt 1")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Retry call" }));

      expect(await screen.findByText("Voice call interview-1 attempt 2")).toBeInTheDocument();
      expect(screen.queryByText("Voice call interview-1 attempt 1")).not.toBeInTheDocument();
    });
  });

  describe("resuming a typing interview", () => {
    function saveInterview() {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-1" }));
    }

    it("goes straight back into the chat with the saved messages, skipping intro and intake", async () => {
      saveInterview();
      const fetchSpy = stubFetch({
        textState: () =>
          jsonResponse(
            makeState({
              messages: stateMessages(["interviewer", "Hi Sam!"], ["participant", "Hello"]),
            }),
          ),
      });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Chat interview-1 with 2 saved messages")).toBeInTheDocument();
      expect(screen.getByText("Hi Sam!")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
      expect(fetchSpy.mock.calls[0][0]).toBe(
        "/api/interviews/interview-1/text-state?linkToken=token-1",
      );
    });

    it("shows nothing but a blank screen, not the intro, while it checks", async () => {
      saveInterview();
      const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchSpy);
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
      expect(screen.queryByText("Post-webinar feedback")).not.toBeInTheDocument();
    });

    it("shows the thank-you screen and forgets the interview when it already finished", async () => {
      saveInterview();
      stubFetch({
        textState: () =>
          jsonResponse(
            makeState({
              status: "completed",
              endedReason: "text-interview-ended",
              messages: stateMessages(["interviewer", "Thanks, bye!"]),
            }),
          ),
      });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("forgets an interview the server doesn't know and starts at the intro", async () => {
      saveInterview();
      stubFetch({ textState: () => jsonResponse({ error: "Interview not found" }, 404) });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("shows the inactivity screen, not the thank-you, when the interview timed out while they were away", async () => {
      saveInterview();
      stubFetch({
        textState: () =>
          jsonResponse(
            makeState({
              status: "completed",
              endedReason: "participant-inactive",
              messages: stateMessages(["interviewer", "Are you still there?"]),
            }),
          ),
      });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("This interview ended due to inactivity")).toBeInTheDocument();
      expect(screen.queryByText("Thank you, you're done!")).not.toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("shows the thank-you for an interview that ended at the time cap", async () => {
      saveInterview();
      stubFetch({
        textState: () =>
          jsonResponse(
            makeState({
              status: "completed",
              endedReason: "time-cap",
              messages: stateMessages(["interviewer", "We're out of time."]),
            }),
          ),
      });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
    });

    it("forgets an interview that never started and starts at the intro", async () => {
      saveInterview();
      stubFetch({ textState: () => jsonResponse(makeState({ status: "pending" })) });
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("keeps the saved interview and offers a retry when the server can't be reached", async () => {
      saveInterview();
      let attempts = 0;
      stubFetch({
        textState: () => {
          attempts += 1;
          return attempts === 1
            ? jsonResponse({}, 500)
            : jsonResponse(makeState({ messages: stateMessages(["interviewer", "Hi Sam!"]) }));
        },
      });
      const user = userEvent.setup();
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText(/couldn't reconnect/)).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("Chat interview-1 with 1 saved messages")).toBeInTheDocument();
    });

    it("starts at the intro, with no request, when nothing is saved", async () => {
      const fetchSpy = stubFetch({});
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("keeps a saved interview for a different study separate", async () => {
      window.localStorage.setItem(
        "interview:some-other-token",
        JSON.stringify({ interviewId: "interview-9" }),
      );
      const fetchSpy = stubFetch({});
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("still blocks mobile without checking for a saved interview", async () => {
      stubUserAgent(MOBILE_UA);
      saveInterview();
      const fetchSpy = stubFetch({});
      render(<InterviewFlow linkToken="token-1" {...feedbackStudy} textModeEnabled />);

      expect(await screen.findByText("Please open this link on a desktop")).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
