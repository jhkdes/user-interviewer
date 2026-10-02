"use client";

import { useState } from "react";

/** Copies every participant's email, comma-separated, to the clipboard — e.g. to paste into a mailing tool's recipient field. `emails` is expected pre-deduplicated by the caller. */
export function CopyParticipantEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(emails.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={handleCopy} className="text-sm underline hover:no-underline">
      {copied ? "Copied!" : `Copy participant emails (${emails.length})`}
    </button>
  );
}
