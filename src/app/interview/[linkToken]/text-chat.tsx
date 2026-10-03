"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INTERVIEWER_NAME } from "@/interview-agent/shared-prompt-parts";
import {
  CHAT_POLL_INTERVAL_MS,
  MAX_MESSAGE_CHARS,
  TYPING_SIGNAL_INTERVAL_MS,
} from "@/text-session/constants";
import { countCharacters } from "@/text-session/count-characters";
import type { TextState } from "@/text-session/text-state";
import {
  fetchTextState,
  reportTyping,
  sendTextTurn,
  type TextTurnOutcome,
  type TextTurnRequest,
} from "./text-turn-client";

export interface ChatMessage {
  /** Stable React key: the server `seq` once known, a local counter before then. */
  key: string;
  speaker: "interviewer" | "participant";
  text: string;
}

/** Shows the interviewer's last message for a moment before leaving the chat. */
const END_SCREEN_DELAY_MS = 2500;
/** How long to wait for a reply that is still being written on the server before giving up on it. */
const RECOVERY_POLL_INTERVAL_MS = 2000;
const RECOVERY_POLL_ATTEMPTS = 15;
/** Show the character counter once the draft is this close to the limit. */
const COUNTER_THRESHOLD = Math.floor(MAX_MESSAGE_CHARS * 0.9);

type Status = "starting" | "idle" | "waiting" | "ended";

interface Notice {
  text: string;
  /** Present when there is something to retry. */
  retry?: () => void;
}

export function messagesFromState(state: TextState): ChatMessage[] {
  return state.messages.map((m) => ({
    key: `seq-${m.seq}`,
    speaker: m.speaker,
    text: m.text,
  }));
}

function newMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" role="status" aria-label="The interviewer is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function Bubble({
  speaker,
  children,
}: {
  speaker: ChatMessage["speaker"];
  children: React.ReactNode;
}) {
  const mine = speaker === "participant";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          mine
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The written-chat interview: the AI interviewer's messages stream in, the
 * participant types replies. Owns the conversation for one text interview;
 * the server (see src/text-session) is the source of truth and the chat
 * recovers from dropped connections by re-reading the interview's state.
 *
 * `onEnded` fires once the interview is over (the interviewer wrapped up, the
 * time cap hit, or the participant said they needed to go), with the reason
 * the server recorded.
 */
export function TextChat({
  interviewId,
  linkToken,
  initialMessages,
  onEnded,
}: {
  interviewId: string;
  linkToken: string;
  /** Messages already in the interview — non-empty when resuming. Empty for a new interview, which asks for the opening greeting. */
  initialMessages: ChatMessage[];
  onEnded: (endedReason: string | null) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(initialMessages.length === 0 ? "starting" : "idle");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const localCounter = useRef(0);
  const started = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingSignal = useRef(0);
  // Latest values for the poll below, which must not act on a stale view.
  const statusRef = useRef<Status>(status);
  const messagesRef = useRef<ChatMessage[]>(messages);
  statusRef.current = status;
  messagesRef.current = messages;

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages, streaming, notice]);

  const nextLocalKey = (speaker: ChatMessage["speaker"]) =>
    `local-${speaker}-${(localCounter.current += 1)}`;

  const finish = useCallback(
    (endedReason: string | null, delayMs: number) => {
      setStatus("ended");
      setStreaming(null);
      if (endTimer.current) clearTimeout(endTimer.current);
      endTimer.current = setTimeout(() => {
        if (!unmounted.current) onEnded(endedReason);
      }, delayMs);
    },
    [onEnded],
  );

  /** Replaces what is on screen with the server's version of the conversation. Returns the state, or null if it couldn't be read. */
  const resync = useCallback(async (): Promise<TextState | null> => {
    const result = await fetchTextState(interviewId, linkToken);
    if (unmounted.current) return null;
    if (result.kind !== "ok") return null;
    setMessages(messagesFromState(result.state));
    if (result.state.status === "completed" || result.state.status === "expired") {
      finish(result.state.endedReason, 0);
    }
    return result.state;
  }, [finish, interviewId, linkToken]);

  const runTurn = useCallback(
    async (request: TextTurnRequest): Promise<void> => {
      setStatus((s) => (s === "starting" ? s : "waiting"));
      setNotice(null);
      setStreaming("");

      const retryThisTurn = () => {
        void runTurn({ ...request, retry: true });
      };
      const unrepliedState = (state: TextState | null) => {
        if (!state) return true;
        const last = state.messages[state.messages.length - 1];
        // No messages yet means the opening greeting hasn't arrived either.
        return !last || last.speaker === "participant";
      };

      /** Waits for a reply that is still being written, or fails over to a retry prompt. */
      const recover = async (): Promise<void> => {
        for (let attempt = 0; attempt < RECOVERY_POLL_ATTEMPTS; attempt++) {
          const state = await resync();
          if (unmounted.current) return;
          if (state && !unrepliedState(state)) {
            setStreaming(null);
            setStatus((s) => (s === "ended" ? s : "idle"));
            return;
          }
          if (state?.status === "completed") return;
          await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_INTERVAL_MS));
          if (unmounted.current) return;
        }
        setStreaming(null);
        setStatus("idle");
        setNotice({
          text: "The interviewer's reply didn't arrive.",
          retry: retryThisTurn,
        });
      };

      const outcome: TextTurnOutcome = await sendTextTurn(interviewId, request, (delta) => {
        if (!unmounted.current) setStreaming((current) => (current ?? "") + delta);
      });
      if (unmounted.current) return;

      switch (outcome.kind) {
        case "done": {
          setMessages((current) => [
            ...current,
            {
              key: `seq-${outcome.message.seq}`,
              speaker: "interviewer",
              text: outcome.message.text,
            },
          ]);
          setStreaming(null);
          if (outcome.interviewOver) {
            finish(outcome.endedReason, END_SCREEN_DELAY_MS);
          } else {
            setStatus("idle");
          }
          return;
        }
        case "rejected": {
          setStreaming(null);
          if (outcome.code === "interview-ended") {
            finish(outcome.endedReason, 0);
            return;
          }
          if (outcome.code === "still-replying") {
            setStatus("waiting");
            await recover();
            return;
          }
          if (outcome.code === "conflict" || outcome.code === "opening-already-done") {
            const state = await resync();
            setStatus((s) => (s === "ended" ? s : "idle"));
            if (!state) setNotice({ text: outcome.message });
            return;
          }
          // Nothing was saved (too long, rate limited, invalid, server error):
          // take the optimistic bubble back so the participant can fix and resend.
          if (request.message !== undefined) {
            const text = request.message;
            setMessages((current) => {
              const last = current[current.length - 1];
              return last?.speaker === "participant" && last.text === text
                ? current.slice(0, -1)
                : current;
            });
            setDraft((current) => (current === "" ? text : current));
          }
          setStatus((s) => (s === "starting" ? s : "idle"));
          setNotice({
            text: outcome.message,
            retry: request.message === undefined ? retryThisTurn : undefined,
          });
          return;
        }
        case "stream-error": {
          setStreaming(null);
          if (outcome.code === "conflict") {
            await resync();
            setStatus((s) => (s === "ended" ? s : "idle"));
            return;
          }
          setStatus((s) => (s === "starting" ? s : "idle"));
          setNotice({ text: outcome.message, retry: retryThisTurn });
          return;
        }
        case "connection-lost": {
          // The server may still finish and save the reply. Look before retrying.
          await recover();
          return;
        }
      }
    },
    [finish, interviewId, resync],
  );

  // New interview: ask for the opening greeting. Resumed interview whose last
  // message is the participant's: the reply never arrived, so ask again (the
  // server declines if it's still being written, and recovery waits for it).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const last = initialMessages[initialMessages.length - 1];
    if (initialMessages.length === 0 || last?.speaker === "participant") {
      void runTurn({ clientMessageId: newMessageId() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the participant is idle in the chat, re-read the interview now and
  // then (and whenever the tab becomes visible again) to pick up the
  // scripted "are you still there?" nudge and to notice that the interview
  // was ended for them, e.g. for inactivity. Not while a turn is in flight:
  // that has its own recovery, and a poll could overwrite what it is drawing.
  useEffect(() => {
    if (status !== "idle") return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await fetchTextState(interviewId, linkToken);
      if (unmounted.current || result.kind !== "ok" || statusRef.current !== "idle") return;
      const { state } = result;
      if (state.status === "completed" || state.status === "expired") {
        finish(state.endedReason, 0);
        return;
      }
      const current = messagesRef.current;
      const changed =
        state.messages.length !== current.length ||
        state.messages[state.messages.length - 1]?.text !== current[current.length - 1]?.text;
      if (changed) setMessages(messagesFromState(state));
    };
    const interval = setInterval(() => void poll(), CHAT_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, interviewId, linkToken, finish]);

  /** Tells the server the participant is typing (at most once every TYPING_SIGNAL_INTERVAL_MS), so the idle nudge and timeout wait for them. */
  const onDraftChange = (value: string) => {
    setDraft(value);
    if (
      status === "idle" &&
      value.trim() !== "" &&
      Date.now() - lastTypingSignal.current >= TYPING_SIGNAL_INTERVAL_MS
    ) {
      lastTypingSignal.current = Date.now();
      reportTyping(interviewId);
    }
  };

  const length = countCharacters(draft.trim());
  const overLimit = length > MAX_MESSAGE_CHARS;
  const canSend = status === "idle" && draft.trim() !== "" && !overLimit;

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    setMessages((current) => [
      ...current,
      { key: nextLocalKey("participant"), speaker: "participant", text },
    ]);
    void runTurn({ clientMessageId: newMessageId(), message: text });
  };

  const typing = streaming !== null && status !== "ended";

  return (
    <div className="flex h-[100dvh] w-full flex-col py-4">
      <header className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Feedback chat</h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          You&apos;re chatting with {INTERVIEWER_NAME}, an AI interviewer.
        </p>
      </header>

      <div
        className="flex-1 space-y-3 overflow-y-auto py-4"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {messages.map((message) => (
          <Bubble key={message.key} speaker={message.speaker}>
            {message.text}
          </Bubble>
        ))}
        {typing && <Bubble speaker="interviewer">{streaming ? streaming : <TypingDots />}</Bubble>}
        {notice && (
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {notice.text}
            {notice.retry && (
              <button onClick={notice.retry} className="ml-2 font-semibold underline">
                Try again
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {status === "ended" ? (
        <p className="border-t border-neutral-200 pt-3 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          The interview has ended.
        </p>
      ) : (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              disabled={status !== "idle"}
              rows={2}
              aria-label="Your message"
              placeholder={status === "starting" ? "Getting ready…" : "Type your reply…"}
              className="min-h-[3rem] flex-1 resize-none rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            />
            <button
              onClick={send}
              disabled={!canSend}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Send
            </button>
          </div>
          {(overLimit || length >= COUNTER_THRESHOLD) && (
            <p
              className={`mt-1 text-xs ${
                overLimit
                  ? "text-red-600 dark:text-red-400"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
              aria-live="polite"
            >
              {overLimit
                ? `Your message is a bit long (${length.toLocaleString("en-US")} of ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters). Please shorten it a little and send it again.`
                : `${length.toLocaleString("en-US")} / ${MAX_MESSAGE_CHARS.toLocaleString("en-US")}`}
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            To end the interview, just tell the interviewer that you need to go.
          </p>
        </div>
      )}
    </div>
  );
}
