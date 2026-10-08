import type { AggregatedLedger } from "../ledger/aggregate";
import type { EvidenceLedger } from "../ledger/types";
import type { NarrativePack } from "../report/narrative";
import type { ComparisonRow, Report } from "../report/types";
import type { ScoringResult } from "../scoring/score";

/**
 * Where a job-search report is in its life.
 *
 * pending     waiting for the worker
 * generating  being worked on (an abandoned one is picked up again once stale)
 * draft       ready for a reviewer
 * released    the participant can open it
 * withdrawn   access removed after release
 * failed      the pipeline gave up (see `error`)
 * skipped     not worth analyzing, for example a too-short interview (see `error`)
 */
export type JobSearchReportStatus =
  "pending" | "generating" | "draft" | "released" | "withdrawn" | "failed" | "skipped";

export interface JobSearchReport {
  id: string;
  interviewId: string;
  studyId: string;
  status: JobSearchReportStatus;
  rubricVersion: string | null;
  /** Each completed extraction run, kept so a restart resumes instead of repeating them. */
  extractionRuns: EvidenceLedger[];
  aggregate: AggregatedLedger | null;
  scoring: ScoringResult | null;
  /** What the report writer was given, so a reviewer can see exactly what the prose rests on. */
  pack: NarrativePack | null;
  /** The typical-versus-successful comparison, for the reviewer and the cohort baseline. Never shown to participants. */
  comparison: ComparisonRow[] | null;
  /** The report exactly as generated. */
  generatedReport: Report | null;
  /** The current report: the generated one plus any reviewer edits. This is what a participant sees. */
  report: Report | null;
  narrativeViolations: string[];
  textViolations: string[];
  error: string | null;
  attempts: number;
  /** Set on release; the participant's link is `/report/<token>`. Cleared on withdrawal. */
  accessToken: string | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  emailSentAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueJobSearchReportInput {
  interviewId: string;
  studyId: string;
  /** "skipped" records an interview that will not be analyzed, with the reason in `error`. Defaults to "pending". */
  status?: "pending" | "skipped";
  error?: string;
}

/** Partial update: only the given fields are persisted. `updatedAt` is always set by the repository. */
export type JobSearchReportPatch = Partial<
  Omit<JobSearchReport, "id" | "interviewId" | "studyId" | "createdAt" | "updatedAt">
>;

export interface JobSearchReportRepository {
  /** Creates the report row for an interview. Idempotent: if one already exists it is returned with `created: false`. */
  enqueue(
    input: EnqueueJobSearchReportInput,
  ): Promise<{ report: JobSearchReport; created: boolean }>;
  getById(id: string): Promise<JobSearchReport | null>;
  getByInterviewId(interviewId: string): Promise<JobSearchReport | null>;
  /** Only a released report has an access token. */
  getByAccessToken(token: string): Promise<JobSearchReport | null>;
  /** Newest first. */
  listByStudyId(studyId: string): Promise<JobSearchReport[]>;
  /**
   * Takes the oldest report that is pending, or generating but untouched since
   * `staleBefore` (an abandoned run), marks it generating, and returns it.
   * Returns null when there is nothing to do. Safe against two workers racing.
   */
  claimNext(options: { staleBefore: Date }): Promise<JobSearchReport | null>;
  update(id: string, patch: JobSearchReportPatch): Promise<JobSearchReport>;
}
