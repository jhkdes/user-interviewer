"use client";

import Link from "next/link";

/** Hidden from the printed/exported output itself via `print:hidden` — only the report content below it should ever end up on the page/PDF. */
export function PrintButton({ editHref }: { editHref: string }) {
  return (
    <div className="print:hidden mb-6 flex gap-2">
      <Link
        href={editHref}
        className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Edit redacted transcript
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
