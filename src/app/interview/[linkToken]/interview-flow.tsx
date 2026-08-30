"use client";

import { useEffect, useState } from "react";
import type { Interview } from "@/domain";
import { isMobileDevice } from "@/lib/device";
import { CompletionScreen } from "./completion-screen";
import { IntakeForm } from "./intake-form";
import { IntroScreen } from "./intro-screen";
import { LiveCall } from "./live-call";
import { MobileBlockedScreen } from "./mobile-blocked-screen";

type Step = "loading" | "mobile-blocked" | "intro" | "intake" | "call" | "done";

/** Orchestrates T11.1–T11.4 as one client-side flow (no page reloads between steps). */
export function InterviewFlow({ linkToken }: { linkToken: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [interview, setInterview] = useState<Interview | null>(null);

  useEffect(() => {
    // Device detection needs `navigator`, unavailable during SSR — determined
    // once on mount rather than in the useState initializer, to avoid a
    // server/client hydration mismatch. "loading" renders nothing for this
    // one instant instead.
    // Mobile is a hard stop, not a dismissible warning — until interviews
    // move to a real phone call (immune to screen-lock/backgrounding), a
    // degraded "continue anyway" experience isn't offered (see
    // mobile-blocked-screen.tsx).
    setStep(isMobileDevice() ? "mobile-blocked" : "intro");
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      {step === "mobile-blocked" && <MobileBlockedScreen />}
      {step === "intro" && <IntroScreen onAgree={() => setStep("intake")} />}
      {step === "intake" && (
        <IntakeForm
          linkToken={linkToken}
          deviceType="desktop"
          onStarted={(createdInterview) => {
            setInterview(createdInterview);
            setStep("call");
          }}
        />
      )}
      {step === "call" && interview && (
        <LiveCall
          interviewId={interview.id}
          firstName={interview.firstName}
          voiceProvider={interview.voiceProvider}
          onEnded={() => setStep("done")}
        />
      )}
      {step === "done" && <CompletionScreen />}
    </main>
  );
}
