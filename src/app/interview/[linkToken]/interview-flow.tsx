"use client";

import { useCallback, useEffect, useState } from "react";
import type { Interview, PreInterviewQuestion, StudyType } from "@/domain";
import { isMobileDevice } from "@/lib/device";
import { CompletionScreen } from "./completion-screen";
import { FeedbackIntroScreen } from "./feedback-intro-screen";
import { IntakeForm } from "./intake-form";
import { IntroScreen } from "./intro-screen";
import { LiveCall } from "./live-call";
import { MobileBlockedScreen } from "./mobile-blocked-screen";
import { ModeSelectScreen } from "./mode-select-screen";
import { messagesFromState, TextChat, type ChatMessage } from "./text-chat";
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
  | "mode-select"
  | "call"
  | "chat"
  | "resume-error"
  | "timed-out"
  | "done";

/** The `endedReason` of a typed interview that was ended because the participant stopped responding. */
const INACTIVE_REASON = "participant-inactive";

/** What the typing chat needs to start (a new text interview) or resume (a saved one). */
interface ChatSession {
  interviewId: string;
  initialMessages: ChatMessage[];
}

/** Orchestrates T11.1–T11.4 as one client-side flow (no page reloads between steps). */
export function InterviewFlow({
  linkToken,
  trackingId,
  type,
  title,
  description,
  questions,
  textModeEnabled = false,
}: {
  linkToken: string;
  trackingId?: string;
  type: StudyType;
  title: string;
  description: string;
  questions: PreInterviewQuestion[];
  /** Offer typing as an alternative to the voice interview. Only ever applies to feedback studies — discovery studies stay voice-only whatever this says. */
  textModeEnabled?: boolean;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [interview, setInterview] = useState<Interview | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [usedTyping, setUsedTyping] = useState(false);
  // Bumped to start a fresh voice call after an error, by remounting it.
  const [callAttempt, setCallAttempt] = useState(0);

  const textAvailable = textModeEnabled && type === "feedback";

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
      setChatSession({ interviewId: savedId, initialMessages: messagesFromState(state) });
      setUsedTyping(true);
      setStep("chat");
    } else if (state.status === "completed" || state.status === "expired") {
      clearSavedInterviewId(linkToken);
      setUsedTyping(true);
      setStep(state.endedReason === INACTIVE_REASON ? "timed-out" : "done");
    } else {
      // Still pending: the chat never started, so there is nothing to resume.
      clearSavedInterviewId(linkToken);
      setStep("intro");
    }
  }, [linkToken]);

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

  /** Opens a fresh typing chat for the interview just created at intake, remembering it for resume. */
  const beginTypingChat = () => {
    if (!interview) return;
    saveInterviewId(linkToken, interview.id);
    setChatSession({ interviewId: interview.id, initialMessages: [] });
    setUsedTyping(true);
    setStep("chat");
  };

  /** The participant chose typing before the voice call began. Resolves true once the interview has been switched. */
  const switchToTyping = async (): Promise<boolean> => {
    if (!interview) return false;
    try {
      const res = await fetch(`/api/interviews/${interview.id}/start-text`, { method: "POST" });
      if (!res.ok) return false;
    } catch {
      return false;
    }
    beginTypingChat();
    return true;
  };

  const finishChat = (endedReason: string | null) => {
    clearSavedInterviewId(linkToken);
    setStep(endedReason === INACTIVE_REASON ? "timed-out" : "done");
  };

  // The chat needs more room than the centered single-column screens.
  const mainClassName =
    step === "chat"
      ? "mx-auto flex min-h-screen max-w-2xl flex-col px-6"
      : "mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6";

  return (
    <main className={mainClassName}>
      {step === "mobile-blocked" && <MobileBlockedScreen type={type} />}
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
            textModeEnabled={textAvailable}
            onAgree={() => setStep("intake")}
          />
        ) : (
          <IntroScreen title={title} description={description} onAgree={() => setStep("intake")} />
        ))}
      {step === "intake" && (
        <IntakeForm
          linkToken={linkToken}
          trackingId={trackingId}
          deviceType="desktop"
          questions={questions}
          onStarted={(createdInterview) => {
            setInterview(createdInterview);
            setStep(textAvailable ? "mode-select" : "call");
          }}
        />
      )}
      {step === "mode-select" && interview && (
        <ModeSelectScreen onStartVoice={() => setStep("call")} onSwitchToTyping={switchToTyping} />
      )}
      {step === "call" && interview && (
        <LiveCall
          key={callAttempt}
          interviewId={interview.id}
          firstName={interview.firstName}
          voiceProvider={interview.voiceProvider}
          type={type}
          onEnded={() => setStep("done")}
          // Typing is only ever offered here for feedback studies with text mode on.
          onSwitchedToTyping={textAvailable ? beginTypingChat : undefined}
          onRetry={textAvailable ? () => setCallAttempt((n) => n + 1) : undefined}
        />
      )}
      {step === "chat" && chatSession && (
        <TextChat
          interviewId={chatSession.interviewId}
          linkToken={linkToken}
          initialMessages={chatSession.initialMessages}
          onEnded={finishChat}
        />
      )}
      {step === "timed-out" && <TimedOutScreen />}
      {step === "done" && <CompletionScreen mode={usedTyping ? "text" : "voice"} />}
    </main>
  );
}
