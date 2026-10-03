// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../text-chat";
import { TextChat } from "../text-chat";
import {
  doneEvent,
  jsonResponse,
  makeState,
  ndjsonResponse,
  stateMessages,
  turnError,
} from "./text-test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVisibility("visible");
  cleanup();
});

/** Routes fetch calls by URL: text-turn calls consume `turns` in order, text-state calls consume `states`. */
function stubServer(options: { turns?: Response[]; states?: Response[] }) {
  const turns = [...(options.turns ?? [])];
  const states = [...(options.states ?? [])];
  const fetchSpy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    if (url.includes("/text-turn")) {
      const next = turns.shift();
      if (!next) throw new Error("unexpected text-turn call");
      return next;
    }
    if (url.includes("/typing")) return new Response(null, { status: 204 });
    if (url.includes("/text-state")) {
      const next = states.shift();
      if (!next) throw new Error("unexpected text-state call");
      return next;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function callsTo(fetchSpy: ReturnType<typeof stubServer>, fragment: string) {
  return fetchSpy.mock.calls.filter(([url]) => String(url).includes(fragment));
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

function turnBodies(fetchSpy: ReturnType<typeof stubServer>) {
  return fetchSpy.mock.calls
    .filter(([url]) => String(url).includes("/text-turn"))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

function renderChat(
  props: { initialMessages?: ChatMessage[]; onEnded?: (reason: string | null) => void } = {},
) {
  const onEnded = props.onEnded ?? vi.fn();
  render(
    <TextChat
      interviewId="interview-1"
      linkToken="token-1"
      initialMessages={props.initialMessages ?? []}
      onEnded={onEnded}
    />,
  );
  return { onEnded };
}

function greeting() {
  return ndjsonResponse([
    { type: "text-delta", text: "Hi Sam, " },
    { type: "text-delta", text: "thanks for joining." },
    doneEvent(1, "Hi Sam, thanks for joining."),
  ]);
}

describe("TextChat", () => {
  describe("a new interview", () => {
    it("asks for the opening greeting and shows it as the interviewer's message", async () => {
      const fetchSpy = stubServer({ turns: [greeting()] });

      renderChat();

      expect(await screen.findByText("Hi Sam, thanks for joining.")).toBeInTheDocument();
      expect(turnBodies(fetchSpy)).toHaveLength(1);
      expect(turnBodies(fetchSpy)[0]).toEqual({ clientMessageId: expect.any(String) });
      expect(turnBodies(fetchSpy)[0].message).toBeUndefined();
    });

    it("asks for the greeting only once, even if rendered twice in strict mode", async () => {
      const { StrictMode } = await import("react");
      const fetchSpy = stubServer({ turns: [greeting(), greeting()] });

      render(
        <StrictMode>
          <TextChat
            interviewId="interview-1"
            linkToken="token-1"
            initialMessages={[]}
            onEnded={vi.fn()}
          />
        </StrictMode>,
      );

      await screen.findByText("Hi Sam, thanks for joining.");
      expect(turnBodies(fetchSpy)).toHaveLength(1);
    });

    it("keeps the input disabled until the greeting has arrived", async () => {
      stubServer({ turns: [greeting()] });

      renderChat();

      expect(screen.getByLabelText("Your message")).toBeDisabled();
      await screen.findByText("Hi Sam, thanks for joining.");
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
    });
  });

  describe("the help message", () => {
    it("tells the participant how to end the interview, for the whole chat", async () => {
      stubServer({ turns: [greeting()] });
      renderChat();

      expect(
        screen.getByText("To end the interview, just tell the interviewer that you need to go."),
      ).toBeInTheDocument();
      await screen.findByText("Hi Sam, thanks for joining.");
      expect(
        screen.getByText("To end the interview, just tell the interviewer that you need to go."),
      ).toBeInTheDocument();
    });
  });

  describe("sending a message", () => {
    it("shows the participant's message at once, streams the reply, and sends the message to the server", async () => {
      const fetchSpy = stubServer({
        turns: [
          greeting(),
          ndjsonResponse([
            { type: "text-delta", text: "What stood " },
            { type: "text-delta", text: "out most?" },
            doneEvent(3, "What stood out most?"),
          ]),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await screen.findByText("Hi Sam, thanks for joining.");
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "The demo was clear.");
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(screen.getByText("The demo was clear.")).toBeInTheDocument();
      expect(await screen.findByText("What stood out most?")).toBeInTheDocument();
      expect(turnBodies(fetchSpy)[1]).toEqual({
        clientMessageId: expect.any(String),
        message: "The demo was clear.",
      });
      expect(screen.getByLabelText("Your message")).toHaveValue("");
    });

    it("sends on Enter and adds a new line on Shift+Enter", async () => {
      const fetchSpy = stubServer({
        turns: [greeting(), ndjsonResponse([doneEvent(3, "Thanks!")])],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(
        screen.getByLabelText("Your message"),
        "line one{Shift>}{Enter}{/Shift}line two",
      );
      expect(screen.getByLabelText("Your message")).toHaveValue("line one\nline two");
      expect(turnBodies(fetchSpy)).toHaveLength(1);

      await user.type(screen.getByLabelText("Your message"), "{Enter}");

      await screen.findByText("Thanks!");
      expect(turnBodies(fetchSpy)[1].message).toBe("line one\nline two");
    });

    it("does not send an empty or whitespace-only message", async () => {
      const fetchSpy = stubServer({ turns: [greeting()] });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      await user.type(screen.getByLabelText("Your message"), "   {Enter}");

      expect(turnBodies(fetchSpy)).toHaveLength(1);
    });

    it("locks the input while the interviewer is replying", async () => {
      let finishReply: () => void = () => {};
      const slowReply = new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('{"type":"text-delta","text":"Hmm, "}\n'));
            finishReply = () => {
              controller.enqueue(encoder.encode(`${JSON.stringify(doneEvent(3, "Hmm, ok."))}\n`));
              controller.close();
            };
          },
        }),
        { status: 200 },
      );
      stubServer({ turns: [greeting(), slowReply] });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");

      expect(await screen.findByText("Hmm,")).toBeInTheDocument();
      expect(screen.getByLabelText("Your message")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

      await act(async () => finishReply());
      await screen.findByText("Hmm, ok.");
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
    });
  });

  describe("message length", () => {
    it("shows a counter near the limit and a friendly note over it, and will not send", async () => {
      const fetchSpy = stubServer({ turns: [greeting()] });
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
      const input = screen.getByLabelText("Your message");

      fireEvent.change(input, { target: { value: "a".repeat(1850) } });
      expect(screen.getByText("1,850 / 2,000")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();

      fireEvent.change(input, { target: { value: "a".repeat(2340) } });
      expect(screen.getByText(/a bit long \(2,340 of 2,000 characters\)/)).toBeInTheDocument();
      expect(screen.getByText(/shorten it a little/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      fireEvent.keyDown(input, { key: "Enter" });

      expect(turnBodies(fetchSpy)).toHaveLength(1);
      expect(input).toHaveValue("a".repeat(2340));
    });

    it("allows exactly 2,000 characters", async () => {
      stubServer({ turns: [greeting()] });
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      fireEvent.change(screen.getByLabelText("Your message"), {
        target: { value: "a".repeat(2000) },
      });

      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
      expect(screen.getByText("2,000 / 2,000")).toBeInTheDocument();
    });

    it("counts an emoji as one character", async () => {
      stubServer({ turns: [greeting()] });
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      fireEvent.change(screen.getByLabelText("Your message"), {
        target: { value: "😀".repeat(2000) },
      });

      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    });

    it("puts the message back in the box when the server rejects it as too long", async () => {
      stubServer({
        turns: [
          greeting(),
          turnError(
            422,
            "message-too-long",
            "Your message is a bit long (2001 of 2000 characters). Please shorten it a little and send it again.",
          ),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "My long thoughts{Enter}");

      expect(await screen.findByRole("alert")).toHaveTextContent(/2001 of 2000 characters/);
      expect(screen.getByLabelText("Your message")).toHaveValue("My long thoughts");
      // The unsent message is not left behind as if it had been delivered.
      expect(screen.queryByText("My long thoughts", { selector: "div" })).not.toBeInTheDocument();
    });
  });

  describe("when sending is refused", () => {
    it("explains a rate limit and keeps the text to resend", async () => {
      stubServer({
        turns: [
          greeting(),
          turnError(
            429,
            "rate-limited",
            "You're sending messages quite fast. Please wait a moment and try again.",
          ),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "Too fast{Enter}");

      expect(await screen.findByRole("alert")).toHaveTextContent(/quite fast/);
      expect(screen.getByLabelText("Your message")).toHaveValue("Too fast");
      expect(screen.getByLabelText("Your message")).toBeEnabled();
    });
  });

  describe("when the interview ends", () => {
    it("shows the final message, then calls onEnded with the reason after a short pause", async () => {
      stubServer({
        turns: [
          greeting(),
          ndjsonResponse([
            { type: "text-delta", text: "Of course, thanks!" },
            doneEvent(3, "Of course, thanks!", true, "participant-requested"),
          ]),
        ],
      });
      const user = userEvent.setup();
      const { onEnded } = renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "I need to go.{Enter}");

      expect(await screen.findByText("Of course, thanks!")).toBeInTheDocument();
      expect(screen.getByText("The interview has ended.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Your message")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/just tell the interviewer that you need to go/),
      ).not.toBeInTheDocument();
      expect(onEnded).not.toHaveBeenCalled();
      await waitFor(() => expect(onEnded).toHaveBeenCalledWith("participant-requested"), {
        timeout: 4000,
      });
    });

    it("ends immediately, with the reason, when the server says the interview already ended", async () => {
      stubServer({
        turns: [
          greeting(),
          turnError(409, "interview-ended", "This interview has ended.", "participant-inactive"),
        ],
      });
      const user = userEvent.setup();
      const { onEnded } = renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "Hello?{Enter}");

      await waitFor(() => expect(onEnded).toHaveBeenCalledWith("participant-inactive"));
    });
  });

  describe("recovering from failures", () => {
    it("offers to try again after a generation failure, retrying with the same message id", async () => {
      const fetchSpy = stubServer({
        turns: [
          greeting(),
          ndjsonResponse([
            {
              type: "error",
              code: "generation-failed",
              message: "Something went wrong on our side. Please try again.",
            },
          ]),
          ndjsonResponse([doneEvent(3, "What stood out most?")]),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/went wrong on our side/);
      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("What stood out most?")).toBeInTheDocument();
      const [, first, retry] = turnBodies(fetchSpy);
      expect(retry).toEqual({ ...first, retry: true });
      expect(retry.clientMessageId).toBe(first.clientMessageId);
      // The participant's message stays, once.
      expect(screen.getAllByText("Hello")).toHaveLength(1);
    });

    it("looks up what the server saved after a dropped connection and shows the reply if it is there", async () => {
      stubServer({
        turns: [greeting(), new Response(null, { status: 200 })],
        states: [
          jsonResponse(
            makeState({
              messages: stateMessages(
                ["interviewer", "Hi Sam, thanks for joining."],
                ["participant", "Hello"],
                ["interviewer", "What stood out most?"],
              ),
            }),
          ),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");

      expect(await screen.findByText("What stood out most?")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("waits for a reply that is still being written when the server says it is still replying", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubServer({
        turns: [greeting(), turnError(409, "still-replying", "The interviewer is still replying.")],
        states: [
          jsonResponse(
            makeState({
              messages: stateMessages(
                ["interviewer", "Hi Sam, thanks for joining."],
                ["participant", "Hello"],
              ),
            }),
          ),
          jsonResponse(
            makeState({
              messages: stateMessages(
                ["interviewer", "Hi Sam, thanks for joining."],
                ["participant", "Hello"],
                ["interviewer", "What stood out most?"],
              ),
            }),
          ),
        ],
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());
      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(await screen.findByText("What stood out most?")).toBeInTheDocument();
    });

    it("re-reads the conversation after a conflict instead of showing a duplicate", async () => {
      stubServer({
        turns: [
          greeting(),
          ndjsonResponse([
            { type: "error", code: "conflict", message: "The conversation changed." },
          ]),
        ],
        states: [
          jsonResponse(
            makeState({
              messages: stateMessages(
                ["interviewer", "Hi Sam, thanks for joining."],
                ["participant", "Hello"],
                ["interviewer", "A reply from another tab"],
              ),
            }),
          ),
        ],
      });
      const user = userEvent.setup();
      renderChat();
      await waitFor(() => expect(screen.getByLabelText("Your message")).toBeEnabled());

      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");

      expect(await screen.findByText("A reply from another tab")).toBeInTheDocument();
      expect(screen.getAllByText("Hello")).toHaveLength(1);
    });

    it("offers to try the greeting again if it fails", async () => {
      const fetchSpy = stubServer({
        turns: [
          ndjsonResponse([
            {
              type: "error",
              code: "generation-failed",
              message: "Something went wrong on our side. Please try again.",
            },
          ]),
          greeting(),
        ],
      });
      const user = userEvent.setup();
      renderChat();

      await user.click(await screen.findByRole("button", { name: "Try again" }));

      expect(await screen.findByText("Hi Sam, thanks for joining.")).toBeInTheDocument();
      expect(turnBodies(fetchSpy)[1].retry).toBe(true);
    });
  });

  describe("telling the server the participant is typing", () => {
    const resumed: ChatMessage[] = [
      { key: "seq-1", speaker: "interviewer", text: "What stood out most?" },
    ];

    it("sends one signal when typing starts, with no text, then at most one every twenty seconds", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchSpy = stubServer({});
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderChat({ initialMessages: resumed });

      await user.type(screen.getByLabelText("Your message"), "The demo");
      expect(callsTo(fetchSpy, "/typing")).toHaveLength(1);
      const [url, init] = callsTo(fetchSpy, "/typing")[0];
      expect(url).toBe("/api/interviews/interview-1/typing");
      expect(init).toMatchObject({ method: "POST", keepalive: true });
      expect((init as RequestInit).body).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      await user.type(screen.getByLabelText("Your message"), " was clear");
      expect(callsTo(fetchSpy, "/typing")).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      await user.type(screen.getByLabelText("Your message"), "!");
      expect(callsTo(fetchSpy, "/typing")).toHaveLength(2);
    });

    it("does not signal for an empty or whitespace-only draft", async () => {
      const fetchSpy = stubServer({});
      renderChat({ initialMessages: resumed });

      fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "   " } });

      expect(callsTo(fetchSpy, "/typing")).toHaveLength(0);
    });

    it("keeps working when the signal fails to send", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
      renderChat({ initialMessages: resumed });

      fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });

      expect(screen.getByLabelText("Your message")).toHaveValue("hello");
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    });
  });

  describe("polling the interview while the participant is idle", () => {
    const resumed: ChatMessage[] = [
      { key: "seq-1", speaker: "interviewer", text: "What stood out most?" },
    ];

    it("shows the idle nudge when it arrives", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubServer({
        states: [
          jsonResponse(
            makeState({
              messages: stateMessages(
                ["interviewer", "What stood out most?"],
                [
                  "interviewer",
                  "Are you still there? Take your time — reply whenever you're ready.",
                ],
              ),
            }),
          ),
        ],
      });
      renderChat({ initialMessages: resumed });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(
        await screen.findByText(
          "Are you still there? Take your time — reply whenever you're ready.",
        ),
      ).toBeInTheDocument();
    });

    it("leaves the screen alone when nothing has changed", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchSpy = stubServer({
        states: [
          jsonResponse(
            makeState({ messages: stateMessages(["interviewer", "What stood out most?"]) }),
          ),
        ],
      });
      renderChat({ initialMessages: resumed });
      const before = screen.getByText("What stood out most?");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(callsTo(fetchSpy, "/text-state")).toHaveLength(1);
      expect(screen.getByText("What stood out most?")).toBe(before);
    });

    it("notices the interview ended for inactivity and reports the reason", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubServer({
        states: [
          jsonResponse(
            makeState({
              status: "completed",
              endedReason: "participant-inactive",
              messages: stateMessages(["interviewer", "What stood out most?"]),
            }),
          ),
        ],
      });
      const { onEnded } = renderChat({ initialMessages: resumed });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      await waitFor(() => expect(onEnded).toHaveBeenCalledWith("participant-inactive"));
      expect(screen.queryByLabelText("Your message")).not.toBeInTheDocument();
    });

    it("does not poll while the tab is hidden, and checks straight away when it becomes visible", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchSpy = stubServer({
        states: [
          jsonResponse(
            makeState({
              status: "completed",
              endedReason: "participant-inactive",
              messages: stateMessages(["interviewer", "What stood out most?"]),
            }),
          ),
        ],
      });
      const { onEnded } = renderChat({ initialMessages: resumed });
      setVisibility("hidden");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(callsTo(fetchSpy, "/text-state")).toHaveLength(0);

      setVisibility("visible");
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(onEnded).toHaveBeenCalledWith("participant-inactive"));
      expect(callsTo(fetchSpy, "/text-state")).toHaveLength(1);
    });

    it("does not poll while a reply is being written", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let finishReply: () => void = () => {};
      const slowReply = new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "text-delta", text: "Hmm, " }) + "\n"),
            );
            finishReply = () => {
              controller.enqueue(encoder.encode(JSON.stringify(doneEvent(3, "Hmm, ok.")) + "\n"));
              controller.close();
            };
          },
        }),
        { status: 200 },
      );
      const fetchSpy = stubServer({ turns: [slowReply] });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderChat({ initialMessages: resumed });
      await user.type(screen.getByLabelText("Your message"), "Hello{Enter}");
      await screen.findByText("Hmm,");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(callsTo(fetchSpy, "/text-state")).toHaveLength(0);

      await act(async () => finishReply());
      await screen.findByText("Hmm, ok.");
    });
  });

  describe("a resumed interview", () => {
    const resumed: ChatMessage[] = [
      { key: "seq-1", speaker: "interviewer", text: "Hi Sam, thanks for joining." },
      { key: "seq-2", speaker: "participant", text: "Hello" },
      { key: "seq-3", speaker: "interviewer", text: "What stood out most?" },
    ];

    it("shows the saved conversation and does not ask for a new greeting", async () => {
      const fetchSpy = stubServer({});

      renderChat({ initialMessages: resumed });

      expect(screen.getByText("Hi Sam, thanks for joining.")).toBeInTheDocument();
      expect(screen.getByText("What stood out most?")).toBeInTheDocument();
      expect(screen.getByLabelText("Your message")).toBeEnabled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("asks for the missing reply when the last saved message is the participant's", async () => {
      const fetchSpy = stubServer({
        turns: [ndjsonResponse([doneEvent(3, "What stood out most?")])],
      });

      renderChat({ initialMessages: resumed.slice(0, 2) });

      expect(await screen.findByText("What stood out most?")).toBeInTheDocument();
      expect(turnBodies(fetchSpy)).toHaveLength(1);
      expect(turnBodies(fetchSpy)[0].message).toBeUndefined();
    });
  });
});
