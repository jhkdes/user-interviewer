import type { SupabaseClient } from "@supabase/supabase-js";
import type { AggregatedLedger } from "../ledger/aggregate";
import type { EvidenceLedger } from "../ledger/types";
import type { NarrativePack } from "../report/narrative";
import type { ComparisonRow, Report } from "../report/types";
import type { ScoringResult } from "../scoring/score";
import type {
  EnqueueJobSearchReportInput,
  JobSearchReport,
  JobSearchReportPatch,
  JobSearchReportRepository,
  JobSearchReportStatus,
} from "./types";

/** Raw row shape from Supabase (snake_case), before mapping to the domain type. */
export interface JobSearchReportRow {
  id: string;
  interview_id: string;
  study_id: string;
  status: string;
  rubric_version: string | null;
  extraction_runs: unknown;
  aggregate: unknown;
  scoring: unknown;
  pack: unknown;
  comparison: unknown;
  generated_report: unknown;
  report: unknown;
  narrative_violations: unknown;
  text_violations: unknown;
  error: string | null;
  attempts: number;
  access_token: string | null;
  released_at: string | null;
  released_by: string | null;
  email_sent_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

const date = (value: string | null) => (value ? new Date(value) : null);

function toReport(row: JobSearchReportRow): JobSearchReport {
  return {
    id: row.id,
    interviewId: row.interview_id,
    studyId: row.study_id,
    status: row.status as JobSearchReportStatus,
    rubricVersion: row.rubric_version,
    extractionRuns: (row.extraction_runs as EvidenceLedger[] | null) ?? [],
    aggregate: (row.aggregate as AggregatedLedger | null) ?? null,
    scoring: (row.scoring as ScoringResult | null) ?? null,
    pack: (row.pack as NarrativePack | null) ?? null,
    comparison: (row.comparison as ComparisonRow[] | null) ?? null,
    generatedReport: (row.generated_report as Report | null) ?? null,
    report: (row.report as Report | null) ?? null,
    narrativeViolations: (row.narrative_violations as string[] | null) ?? [],
    textViolations: (row.text_violations as string[] | null) ?? [],
    error: row.error,
    attempts: row.attempts,
    accessToken: row.access_token,
    releasedAt: date(row.released_at),
    releasedBy: row.released_by,
    emailSentAt: date(row.email_sent_at),
    withdrawnAt: date(row.withdrawn_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** Maps a domain patch to row columns, leaving out anything that was not given. */
function toRowPatch(patch: JobSearchReportPatch): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  const set = <K extends keyof JobSearchReportPatch>(
    key: K,
    column: string,
    map?: (v: NonNullable<JobSearchReportPatch[K]> | null) => unknown,
  ) => {
    if (patch[key] === undefined) return;
    columns[column] = map ? map(patch[key] as never) : patch[key];
  };
  set("status", "status");
  set("rubricVersion", "rubric_version");
  set("extractionRuns", "extraction_runs");
  set("aggregate", "aggregate");
  set("scoring", "scoring");
  set("pack", "pack");
  set("comparison", "comparison");
  set("generatedReport", "generated_report");
  set("report", "report");
  set("narrativeViolations", "narrative_violations");
  set("textViolations", "text_violations");
  set("error", "error");
  set("attempts", "attempts");
  set("accessToken", "access_token");
  set("releasedAt", "released_at", (v) => iso(v as Date | null));
  set("releasedBy", "released_by");
  set("emailSentAt", "email_sent_at", (v) => iso(v as Date | null));
  set("withdrawnAt", "withdrawn_at", (v) => iso(v as Date | null));
  return columns;
}

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

export class SupabaseJobSearchReportRepository implements JobSearchReportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async enqueue(input: EnqueueJobSearchReportInput) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .insert({
        interview_id: input.interviewId,
        study_id: input.studyId,
        status: input.status ?? "pending",
        error: input.error ?? null,
      })
      .select()
      .single();

    if (!error) return { report: toReport(data as JobSearchReportRow), created: true };

    if (error.code === UNIQUE_VIOLATION) {
      const existing = await this.getByInterviewId(input.interviewId);
      if (existing) return { report: existing, created: false };
    }
    throw new Error(`Failed to enqueue job-search report: ${error.message}`);
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch job-search report: ${error.message}`);
    return data ? toReport(data as JobSearchReportRow) : null;
  }

  async getByInterviewId(interviewId: string) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .select()
      .eq("interview_id", interviewId)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch job-search report: ${error.message}`);
    return data ? toReport(data as JobSearchReportRow) : null;
  }

  async getByAccessToken(token: string) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .select()
      .eq("access_token", token)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch job-search report: ${error.message}`);
    return data ? toReport(data as JobSearchReportRow) : null;
  }

  async listByStudyId(studyId: string) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .select()
      .eq("study_id", studyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list job-search reports: ${error.message}`);
    return (data as JobSearchReportRow[]).map(toReport);
  }

  async claimNext(options: { staleBefore: Date }) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .select()
      .or(
        `status.eq.pending,and(status.eq.generating,updated_at.lt.${options.staleBefore.toISOString()})`,
      )
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw new Error(`Failed to look for a report to process: ${error.message}`);

    for (const candidate of data as JobSearchReportRow[]) {
      // Optimistic claim: only succeeds if nobody changed the row since we read it.
      const { data: claimed, error: claimError } = await this.client
        .from("job_search_reports")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("status", candidate.status)
        .eq("updated_at", candidate.updated_at)
        .select();
      if (claimError) throw new Error(`Failed to claim job-search report: ${claimError.message}`);
      if (claimed && claimed.length > 0) return toReport(claimed[0] as JobSearchReportRow);
    }
    return null;
  }

  async update(id: string, patch: JobSearchReportPatch) {
    const { data, error } = await this.client
      .from("job_search_reports")
      .update({ ...toRowPatch(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to update job-search report: ${error.message}`);
    if (!data) throw new Error(`Job-search report not found: ${id}`);
    return toReport(data as JobSearchReportRow);
  }
}
