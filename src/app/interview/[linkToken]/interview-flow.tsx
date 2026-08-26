"use client";

import { useEffect, useState } from "react";
import type { Interview } from "@/domain";
import { isMobileDevice } from "@/lib/device";
import { CompletionScreen } from "./completion-screen";
import { IntakeForm } from "./intake-form";
import { IntroScreen } from "./intro-screen";
import { LiveCall } from "./live-call";
import { MobileWarningScreen } from "./mobile-warning-screen";

type Step = "loading" | "mobile-warning" | "intro" | "intake" | "call" | "done";

/** Orchestrates T11.1–T11.4 as one client-side flow (no page reloads between steps). */
export function InterviewFlow({ linkToken }: { linkToken: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [deviceType, setDeviceType] = useState<"desktop" | "mobile">("desktop");
  const [interview, setInterview] = useState<Interview | null>(null);

  useEffect(() => {
    // Device detection needs `navigator`, unavailable during SSR — determined
    // once on mount rather than in the useState initializer, to avoid a
    // server/client hydration mismatch. "loading" renders nothing for this
    // one instant instead.
    if (isMobileDevice()) {
      setDeviceType("mobile");
      setStep("mobile-warning");
    } else {
      setStep("intro");
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      {step === "mobile-warning" && (
        <MobileWarningScreen onContinueAnyway={() => setStep("intro")} />
      )}
      {step === "intro" && <IntroScreen onAgree={() => setStep("intake")} />}
      {step === "intake" && (
        <IntakeForm
          linkToken={linkToken}
          deviceType={deviceType}
          onStarted={(createdInterview) => {
            setInterview(createdInterview);
            setStep("call");
          }}
        />
      )}
      {step === "call" && interview && (
        <LiveCall interviewId={interview.id} onEnded={() => setStep("done")} />
      )}
      {step === "done" && <CompletionScreen />}
    </main>
  );
}
