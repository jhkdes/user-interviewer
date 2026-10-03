"use client";

import type { StudyType, VoiceProvider } from "@/domain";
import { ElevenLabsLiveCall } from "./elevenlabs-live-call";
import { VapiLiveCall } from "./vapi-live-call";

/**
 * Switches between provider-specific call components based on which
 * platform this interview's study is A/B'd onto. The two SDKs' event models
 * and setup sequencing (ElevenLabs needs an async signed-url fetch before
 * starting; Vapi doesn't) differ enough that keeping them as separate
 * components — rather than one hook with a provider-conditional branch — was
 * the simpler, safer choice; see call-shell.tsx for what they share.
 */
export function LiveCall({
  interviewId,
  firstName,
  voiceProvider,
  type,
  onEnded,
  onSwitchedToTyping,
  onRetry,
}: {
  interviewId: string;
  firstName: string;
  voiceProvider: VoiceProvider;
  type: StudyType;
  onEnded: () => void;
  /** Typing is offered (feedback studies with text mode on): called once the interview was restarted as a typing interview. */
  onSwitchedToTyping?: () => void;
  /** A retry is offered after an error before the call began. */
  onRetry?: () => void;
}) {
  return voiceProvider === "elevenlabs" ? (
    <ElevenLabsLiveCall
      interviewId={interviewId}
      firstName={firstName}
      type={type}
      onEnded={onEnded}
      onSwitchedToTyping={onSwitchedToTyping}
      onRetry={onRetry}
    />
  ) : (
    <VapiLiveCall
      interviewId={interviewId}
      type={type}
      onEnded={onEnded}
      onSwitchedToTyping={onSwitchedToTyping}
      onRetry={onRetry}
    />
  );
}
