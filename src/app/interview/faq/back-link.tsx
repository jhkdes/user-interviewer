"use client";

import { useRouter } from "next/navigation";

/**
 * Returns the participant to whichever study's landing page linked here —
 * `router.back()` rather than a hardcoded href, since the FAQ page itself
 * doesn't know which study's link token sent them here.
 */
export function BackLink() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
    >
      &larr; Back
    </button>
  );
}
