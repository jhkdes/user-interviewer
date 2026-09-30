import type { StudyReport, StudyReportTheme, StudyReportType } from "@/domain";

export interface CreateStudyReportInput {
  studyId: string;
  /** Defaults to `"discovery"` if omitted. */
  type?: StudyReportType;
  /** Discovery-type only — omit/empty for feedback-type reports. */
  themes?: StudyReportTheme[];
  /** Feedback-type only — omit/empty for discovery-type reports. */
  whatWorkedWell?: StudyReportTheme[];
  whatCouldBeImproved?: StudyReportTheme[];
  topicsForFuture?: StudyReportTheme[];
  otherInsights?: StudyReportTheme[];
}

export interface StudyReportRepository {
  /** Persists a new report version for the study — the repository computes the next version number. */
  create(input: CreateStudyReportInput): Promise<StudyReport>;
  getLatestByStudyId(studyId: string): Promise<StudyReport | null>;
  listByStudyId(studyId: string): Promise<StudyReport[]>;
}
