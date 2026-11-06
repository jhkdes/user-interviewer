"use client";

import { useCallback, useEffect, useState } from "react";
import type { Interview, ParticipantCopy, PreInterviewQuestion, StudyType } from "@/domain";
import { DISCOVERY_TEXT_HARD_CAP_MS } from "@/interview-agent/termination";
import { isMobileDevice } from "@/lib/device";
import { endedEarly } from "./call-end-info";
import { CompletionScreen } from "./completion-screen";
import { EndedEarlyScreen } from "./ended-early-screen";
import { FeedbackIntroScreen } from "./feedback-intro-screen";
import { IntakeForm, type IntakeSubmission } from "./intake-form";
import { IntroScreen } from "./intro-screen";
import { LiveCall } from "./live-call";
import { MicCheckScreen } from "./mic-check-screen";
import { MobileBlockedScreen } from "./mobile-blocked-screen";
import { SessionEndedScreen } from "./session-ended-screen";
import {
  clockFromState,
  messagesFromState,
  TextChat,
  type ChatClock,
  type ChatMessage,
} from "./text-chat";
import {
  clearSavedInterviewId,
  loadSavedInterviewId,
  saveInterviewId,
} from "./text-resume-storage";
import { TimedOutScreen } from "./timed-out-screen";
import { fetchTextState } from "./text-turn-client";

type Step =
  | "loading"
  | "mobile-blocked"
  | "intro"
  | "intake"
  | "mic-check"
  | "call"
  | "chat"
  | "resume-error"
  | "timed-out"
  | "session-ended"
  | "ended-early"
  | "done";

/** The `endedReason` of a typed interview that was ended because the participant stopped responding. */
const INACTIVE_REASON = "participant-inactive";

/** The `endedReason` of a typed interview that was ended because it reached its time limit. */
const TIME_CAP_REASON = "time-cap";

/** What the typing chat needs to start (a new text interview) or resume (a saved one). */
interface ChatSession {
  interviewId: string;
  initialMessages: ChatMessage[];
  /** When the interview started, for a resumed one; a new one learns it after its first reply. */
  initialClock: ChatClock | null;
}

/** Orchestrates T11.1–T11.4 as one client-side flow (no page reloads between steps). */
export function InterviewFlow({
  linkToken,
  trackingId,
  type,
  title,
  description,
  questions,
  copy,
  channel = "voice",
  minParticipantTurns,
  textModeEnabled = false,
}: {
  linkToken: string;
  trackingId?: string;
  type: StudyType;
  title: string;
  description: string;
  questions: PreInterviewQuestion[];
  /** The study's custom landing and ending page text, if it has any. */
  copy?: ParticipantCopy | null;
  /**
   * Which of the study's links this is. `"text"` is the study's text-only
   * link: no voice call, no mode choice — after intake the participant goes
   * straight into a typed chat (a discovery study's has a visible time limit).
   * The voice link is voice only. Defaults to the voice link.
   */
  channel?: "voice" | "text";
  /** A voice call with fewer participant turns than this is treated as ended early. Defaults to a small number; studies that make a report pass the report's minimum. */
  minParticipantTurns?: number;
  /** Typed interviews are switched on for this deploy. A study's text link needs it; a voice link is voice-only whatever this says. */
  textModeEnabled?: boolean;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [interview, setInterview] = useState<Interview | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const textChannel = channel === "text";
  const [usedTyping, setUsedTyping] = useState(textChannel);
  // Bumped to start a fresh voice call after an error, by remounting it.
  const [callAttempt, setCallAttempt] = useState(0);
  // What the participant submitted at intake, so a call that dropped early can be started again without retyping it.
  const [intakeSubmission, setIntakeSubmission] = useState<IntakeSubmission | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  // Only the text link types. A voice link, for either kind of study, never offers typing.
  const textAvailable = textModeEnabled && textChannel;
  // The text-only discovery interview has its own time limit, countdown and "session ended" screen.
  const discoveryText = textChannel && type === "discovery";

  /** Where an interview that has ended for this reason goes: a typed one that ran out of time, or went quiet, gets its own screen. */
  const endStep = useCallback(
    (endedReason: string | null): Step => {
      if (endedReason === INACTIVE_REASON) return "timed-out";
      if (discoveryText && endedReason === TIME_CAP_REASON) return "session-ended";
      return "done";
    },
    [discoveryText],
  );

  /** Puts a participant who was mid-chat back into it; anything else starts at the intro as usual. */
  const resumeOrStart = useCallback(async () => {
    const savedId = loadSavedInterviewId(linkToken);
    if (!savedId) {
      setStep("intro");
      return;
    }
    setStep("loading");
    const result = await fetchTextState(savedId, linkToken);
    if (result.kind === "error") {
      // Keep the saved id: a flaky connection shouldn't lose the interview.
      setStep("resume-error");
      return;
    }
    if (result.kind === "not-found") {
      clearSavedInterviewId(linkToken);
      setStep("intro");
      return;
    }
    const { state } = result;
    if (state.status === "in-progress") {
      setChatSession({
        interviewId: savedId,
        initialMessages: messagesFromState(state),
        initialClock: clockFromState(state),
      });
      setUsedTyping(true);
      setStep("chat");
    } else if (state.status === "completed" || state.status === "expired") {
      clearSavedInterviewId(linkToken);
      setUsedTyping(true);
      setStep(endStep(state.endedReason));
    } else {
      // Still pending: the chat never started, so there is nothing to resume.
      clearSavedInterviewId(linkToken);
      setStep("intro");
    }
  }, [linkToken, endStep]);

  useEffect(() => {
    // Device detection needs `navigator`, unavailable during SSR — determined
    // once on mount rather than in the useState initializer, to avoid a
    // server/client hydration mismatch. "loading" renders nothing for this
    // one instant instead.
    // Mobile is a hard stop, not a dismissible warning — until interviews
    // move to a real phone call (immune to screen-lock/backgrounding), a
    // degraded "continue anyway" experience isn't offered (see
    // mobile-blocked-screen.tsx).
    if (isMobileDevice()) {
      setStep("mobile-blocked");
    } else if (textAvailable) {
      void resumeOrStart();
    } else {
      setStep("intro");
    }
  }, [textAvailable, resumeOrStart]);

  /** Starts a brand-new interview from the details already given, after a call that ended too early. */
  async function startAgain() {
    if (!intakeSubmission) {
      setStep("intro");
      return;
    }
    setRestarting(true);
    setRestartError(null);
    try {
      const res = await fetch(`/api/studies/${linkToken}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intakeSubmission),
      });
      if (!res.ok) throw new Error(String(res.status));
      setInterview((await res.json()) as Interview);
      setStep("mic-check");
    } catch {
      setRestartError(
        "We couldn't start a new interview. Please check your connection and try again.",
      );
    } finally {
      setRestarting(false);
    }
  }

  /** Opens a fresh typing chat for the interview just created at intake, remembering it for resume. */
  const beginTypingChat = (created: Interview | null = interview) => {
    if (!created) return;
    saveInterviewId(linkToken, created.id);
    setChatSession({ interviewId: created.id, initialMessages: [], initialClock: null });
    setUsedTyping(true);
    setStep("chat");
  };

  const finishChat = (endedReason: string | null) => {
    clearSavedInterviewId(linkToken);
    setStep(endStep(endedReason));
  };

  // The chat needs more room than the centered single-column screens.
  const mainClassName =
    step === "chat"
      ? "mx-auto flex min-h-screen max-w-2xl flex-col px-6"
      : "mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6";

  return (
    <main className={mainClassName}>
      {step === "mobile-blocked" && <MobileBlockedScreen type={type} channel={channel} />}
      {step === "resume-error" && (
        <div className="text-center">
          <h1 className="text-xl font-semibold">We couldn&apos;t reconnect to your interview</h1>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Check your connection and try again. Your conversation so far is saved.
          </p>
          <button
            onClick={() => void resumeOrStart()}
            className="mt-6 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Try again
          </button>
        </div>
      )}
      {step === "intro" &&
        (type === "feedback" ? (
          <FeedbackIntroScreen
            title={title}
            description={description}
            channel={channel}
            copy={copy}
            onAgree={() => setStep("intake")}
          />
        ) : (
          <IntroScreen
            title={title}
            description={description}
            copy={copy}
            channel={channel}
            onAgree={() => setStep("intake")}
          />
        ))}
      {step === "intake" && (
        <IntakeForm
          linkToken={linkToken}
          trackingId={trackingId}
          deviceType="desktop"
          questions={questions}
          onSubmitted={setIntakeSubmission}
          onStarted={(createdInterview) => {
            setInterview(createdInterview);
            if (textChannel) {
              // The text link's interviews are typed from the start: no mode choice, no call.
              beginTypingChat(createdInterview);
              return;
            }
            setStep("mic-check");
          }}
        />
      )}
      {step === "mic-check" && interview && (
        <MicCheckScreen
          onContinue={() => {
            setCallAttempt((n) => n + 1);
            setStep("call");
          }}
        />
      )}
      {step === "call" && interview && (
        <LiveCall
          key={callAttempt}
          interviewId={interview.id}
          firstName={interview.firstName}
          voiceProvider={interview.voiceProvider}
          type={type}
          onEnded={(info) =>
            setStep(info && endedEarly(info, minParticipantTurns) ? "ended-early" : "done")
          }
          // A voice call never offers typing: the text link is where typing happens.
          onRetry={
            type === "feedback" && textModeEnabled ? () => setCallAttempt((n) => n + 1) : undefined
          }
        />
      )}
      {step === "chat" && chatSession && (
        <TextChat
          interviewId={chatSession.interviewId}
          linkToken={linkToken}
          initialMessages={chatSession.initialMessages}
          onEnded={finishChat}
          heading={discoveryText ? "Interview chat" : undefined}
          sessionLimitMs={discoveryText ? DISCOVERY_TEXT_HARD_CAP_MS : undefined}
          initialClock={chatSession.initialClock}
        />
      )}
      {step === "timed-out" && <TimedOutScreen />}
      {step === "session-ended" && <SessionEndedScreen copy={copy} />}
      {step === "ended-early" && (
        <EndedEarlyScreen
          onStartAgain={() => void startAgain()}
          starting={restarting}
          error={restartError}
        />
      )}
      {step === "done" && <CompletionScreen mode={usedTyping ? "text" : "voice"} copy={copy} />}
    </main>
  );
}
