import type { InterviewMode, StudyReportType, StudyStatus, StudyType, SummaryType } from "@/domain";

/**
 * What a read-only viewer is allowed to see (VIEWER_ACCESS.md). Every type
 * here is built by an allowlisting mapper in this folder: a field exists on
 * the viewer side only because a mapper copies it, so a column added to the
 * domain types later is hidden from viewers until someone decides otherwise.
 *
 * Dates are ISO strings so these objects are plain JSON.
 */
export interface ViewerStudy {
  id: string;
  type: StudyType;
  title: string;
  description: string;
  status: StudyStatus;
  researchTopic: string | null;
  preInterviewQuestions: { id: string; label: string; options: string[] }[];
  feedbackQuestions: string[];
  createdAt: string;
}

export interface ViewerTranscriptEntry {
  speaker: "interviewer" | "participant";
  text: string;
  timestampMs: number;
}

export interface ViewerSummary {
  type: SummaryType;
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
  liked: string[];
  disliked: string[];
  suggestions: string[];
}

export interface ViewerReportTheme {
  theme: string;
  participantCount: number;
  representativeQuotes: string[];
}

export interface ViewerStudyReport {
  version: number;
  type: StudyReportType;
  themes: ViewerReportTheme[];
  whatWorkedWell: ViewerReportTheme[];
  whatCouldBeImproved: ViewerReportTheme[];
  topicsForFuture: ViewerReportTheme[];
  otherInsights: ViewerReportTheme[];
  generatedAt: string;
}

export interface ViewerInterview {
  id: string;
  /** "Participant N", N being the interview's position by creation time among all of the study's interviews — stable as interviews complete. */
  label: string;
  mode: InterviewMode;
  createdAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  roleDescription: string | null;
  screenerAnswers: Record<string, string | string[]> | null;
  transcript: ViewerTranscriptEntry[] | null;
  /** Whether audio exists. Playback goes through the authenticated recording route, never a stored URL. */
  hasRecording: boolean;
  summary: ViewerSummary | null;
}

export interface ViewerStudyData {
  study: ViewerStudy;
  interviews: ViewerInterview[];
  report: ViewerStudyReport | null;
}
