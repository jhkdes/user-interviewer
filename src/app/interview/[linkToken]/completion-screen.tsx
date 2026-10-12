import type { ParticipantCopy } from "@/domain";
import { resolveCompletionCopy } from "@/participant-copy";

/** T11.4 — shown once the call (or, for a typed interview, the chat) ends. */
export function CompletionScreen({
  mode = "voice",
  copy,
}: {
  mode?: "voice" | "text";
  /** The study's custom wording; anything it leaves out uses the standard text. */
  copy?: ParticipantCopy | null;
}) {
  const { title, message } = resolveCompletionCopy(copy, mode);
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
    </div>
  );
}
