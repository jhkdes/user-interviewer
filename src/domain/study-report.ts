export interface StudyReportTheme {
  theme: string;
  participantCount: number;
  representativeQuotes: string[];
}

/**
 * Studies can have multiple reports over time (re-generated as more interviews
 * complete) — `version` is a monotonically increasing counter per study, and
 * the dashboard shows the latest version by default. See REQUIREMENTS.md.
 */
export interface StudyReport {
  id: string;
  studyId: string;
  version: number;
  themes: StudyReportTheme[];
  generatedAt: Date;
}
