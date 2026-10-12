import type { JobSearchReport } from "../storage/types";

/** The `releasedBy` value on a report that went out without a person releasing it. */
export const AUTO_RELEASE_ACTOR = "auto-release";

/**
 * Why a draft report should wait for a reviewer instead of being released
 * automatically. An empty list means it is clean: no rule violations in the
 * text, and no rating the extraction runs disagreed about.
 */
export function autoReleaseBlockers(report: JobSearchReport): string[] {
  const blockers: string[] = [];
  if (report.status !== "draft") blockers.push(`it is ${report.status}, not a draft`);
  if (!report.report || !report.scoring) blockers.push("it has no report content yet");

  const violations = report.narrativeViolations.length + report.textViolations.length;
  if (violations > 0) {
    blockers.push(`${violations} rule violation${violations === 1 ? "" : "s"} in the text`);
  }

  const lowConfidence = (report.scoring?.behaviors ?? []).filter((b) => b.lowConfidence);
  if (lowConfidence.length > 0) {
    blockers.push(`low-confidence rating for ${lowConfidence.map((b) => b.id).join(", ")}`);
  }
  return blockers;
}

/** Automatic release is on unless AUTO_RELEASE_REPORTS is set to false, 0, no, or off. */
export function autoReleaseEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.AUTO_RELEASE_REPORTS?.trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(value ?? "");
}
