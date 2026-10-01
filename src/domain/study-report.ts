export interface StudyReportTheme {
  theme: string;
  participantCount: number;
  representativeQuotes: string[];
}

/**
 * Mirrors Study's type discriminant: which set of fields below is
 * populated. `themes` for "discovery" (empty for "feedback");
 * `whatWorkedWell`/`whatCouldBeImproved`/`topicsForFuture`/`otherInsights`
 * for "feedback" (all empty for "discovery"). Both sets always present on
 * every StudyReport, same pattern as Study.preInterviewQuestions/
 * feedbackQuestions and Summary's dual field sets.
 */
export type StudyReportType = "discovery" | "feedback";

/**
 * Studies can have multiple reports over time (re-generated as more interviews
 * complete) — `version` is a monotonically increasing counter per study, and
 * the dashboard shows the latest version by default. See REQUIREMENTS.md.
 */
export interface StudyReport {
  id: string;
  studyId: string;
  version: number;
  type: StudyReportType;
  themes: StudyReportTheme[];
  /** Feedback-type only. Recurring positive feedback across participants. */
  whatWorkedWell: StudyReportTheme[];
  /** Feedback-type only. Recurring criticisms/pain points across participants. */
  whatCouldBeImproved: StudyReportTheme[];
  /** Feedback-type only. Topics/subjects participants said they'd like covered in future sessions. */
  topicsForFuture: StudyReportTheme[];
  /** Feedback-type only. Anything else useful to future participants or the feedback subject owner that doesn't fit the three categories above. */
  otherInsights: StudyReportTheme[];
  generatedAt: Date;
}
