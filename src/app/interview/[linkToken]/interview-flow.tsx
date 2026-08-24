"use client";

import { useState } from "react";
import type { Interview } from "@/domain";
import { CompletionScreen } from "./completion-screen";
import { IntakeForm } from "./intake-form";
import { IntroScreen } from "./intro-screen";
import { LiveCall } from "./live-call";

type Step = "intro" | "intake" | "call" | "done";

/** Orchestrates T11.1–T11.4 as one client-side flow (no page reloads between steps). */
export function InterviewFlow({ linkToken }: { linkToken: string }) {
  const [step, setStep] = useState<Step>("intro");
  const [interview, setInterview] = useState<Interview | null>(null);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      {step === "intro" && <IntroScreen onAgree={() => setStep("intake")} />}
      {step === "intake" && (
        <IntakeForm
          linkToken={linkToken}
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
