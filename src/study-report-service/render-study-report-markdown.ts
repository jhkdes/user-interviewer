import type { Study, StudyReport, StudyReportTheme } from "@/domain";

function renderThemes(lines: string[], themes: StudyReportTheme[]): void {
  for (const theme of themes) {
    lines.push(`## ${theme.theme}`, "");
    lines.push(
      `${theme.participantCount} participant${theme.participantCount === 1 ? "" : "s"}`,
      "",
    );
    for (const quote of theme.representativeQuotes) {
      lines.push(`> ${quote}`, "");
    }
  }
}

function renderFeedbackSection(lines: string[], title: string, themes: StudyReportTheme[]): void {
  if (themes.length === 0) return;
  lines.push(`## ${title}`, "");
  for (const theme of themes) {
    lines.push(`### ${theme.theme}`, "");
    lines.push(
      `${theme.participantCount} participant${theme.participantCount === 1 ? "" : "s"}`,
      "",
    );
    for (const quote of theme.representativeQuotes) {
      lines.push(`> ${quote}`, "");
    }
  }
}

/**
 * Renders a StudyReport as a standalone Markdown document, for the "download
 * as .md" option on the study detail page (T-download-report). Pure and
 * synchronous — no I/O — so it's usable from both the download route and
 * tests without a repository. Branches on `report.type`, same as the
 * dashboard's rendering — feedback-type reports get their four named
 * sections instead of a flat list of themes.
 */
export function renderStudyReportMarkdown(study: Study, report: StudyReport): string {
  const lines: string[] = [
    `# ${study.title} — Study Report`,
    "",
    `Version ${report.version} · generated ${report.generatedAt.toISOString()}`,
    "",
  ];

  if (report.type === "feedback") {
    renderFeedbackSection(lines, "What worked well", report.whatWorkedWell);
    renderFeedbackSection(lines, "What could be improved", report.whatCouldBeImproved);
    renderFeedbackSection(lines, "Topics for future sessions", report.topicsForFuture);
    renderFeedbackSection(lines, "Other insights", report.otherInsights);
  } else {
    renderThemes(lines, report.themes);
  }

  return lines.join("\n").trimEnd() + "\n";
}
