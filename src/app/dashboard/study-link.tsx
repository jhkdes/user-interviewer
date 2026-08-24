"use client";

import { useEffect, useState } from "react";

/**
 * The shareable participant link for a study (T10.1 "displays the generated
 * link", also shown on the study detail page for later reference). Computed
 * client-side from `window.location.origin` rather than resolved server-side
 * from request headers — simpler, and matches how `forgot-password/page.tsx`
 * already builds an absolute URL.
 *
 * `/interview/:linkToken` is this project's chosen participant-facing URL
 * shape — M11 (Participant-Facing UI) doesn't exist yet, so this is the
 * first place that convention is established; M11 must serve its
 * intro/consent screen at this path.
 */
export function StudyLink({ linkToken }: { linkToken: string }) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (origin === null) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading link…</p>;
  }

  const url = `${origin}/interview/${linkToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <code className="flex-1 overflow-x-auto whitespace-nowrap">{url}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
