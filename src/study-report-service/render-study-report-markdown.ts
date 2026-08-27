import type { Study, StudyReport } from "@/domain";

/**
 * Renders a StudyReport as a standalone Markdown document, for the "download
 * as .md" option on the study detail page (T-download-report). Pure and
 * synchronous — no I/O — so it's usable from both the download route and
 * tests without a repository.
 */
export function renderStudyReportMarkdown(study: Study, report: StudyReport): string {
  const lines: string[] = [
    `# ${study.targetProfile.jobTitle} — Study Report`,
    "",
    `Version ${report.version} · generated ${report.generatedAt.toISOString()}`,
    "",
  ];

  for (const theme of report.themes) {
    lines.push(`## ${theme.theme}`, "");
    lines.push(
      `${theme.participantCount} participant${theme.participantCount === 1 ? "" : "s"}`,
      "",
    );
    for (const quote of theme.representativeQuotes) {
      lines.push(`> ${quote}`, "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
