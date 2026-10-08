import type { JobSearchReportStatus } from "@/job-search-study/storage/types";

const STYLES: Record<JobSearchReportStatus, string> = {
  pending: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  generating: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  released: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  withdrawn: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  skipped: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

const LABELS: Partial<Record<JobSearchReportStatus, string>> = { draft: "needs review" };

export function StatusChip({ status }: { status: JobSearchReportStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-sm ${STYLES[status]}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
