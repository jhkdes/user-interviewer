import type { EmailClient } from "@/lib/email";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import type { StructuredCompletion } from "../extraction/extract";
import type { Rubric } from "../rubric/rubric";
import type { JobSearchReportRepository } from "../storage/types";

/** What the worker needs to turn completed interviews into draft reports. */
export interface PipelineDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
  reportRepo: JobSearchReportRepository;
  /** The model call used for both extraction and the narrative. */
  complete: StructuredCompletion;
  /** Defaults to the current rubric. */
  rubric?: Rubric;
  /** Overridable so tests can control time. */
  now?: () => Date;
  /** How many independent extraction runs to combine. Default 3. */
  extractionRuns?: number;
  /** Interviews with fewer participant turns than this are skipped as too short to analyze. Default 6. */
  minParticipantTurns?: number;
}

/** What a reviewer's actions need: the repositories, plus the model (to regenerate) and email (to release). */
export interface ReviewDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
  reportRepo: JobSearchReportRepository;
  complete: StructuredCompletion;
  emailClient: EmailClient;
  rubric?: Rubric;
  now?: () => Date;
}

export const DEFAULT_EXTRACTION_RUNS = 3;
export const DEFAULT_MIN_PARTICIPANT_TURNS = 6;
/** A generating report untouched for this long is treated as abandoned and picked up again. */
export const STALE_AFTER_MS = 10 * 60 * 1000;
/** At least this many valid extraction runs are needed to score an interview. */
export const MIN_VALID_RUNS = 2;
