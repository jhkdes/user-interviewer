import type { StudyReport } from "@/domain";
import { autoRedactTranscript } from "@/interview-export-service";
import type {
  FeedbackStudyReportInterviewInput,
  LLMProviderAdapter,
  StudyReportInterviewInput,
} from "@/llm";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyReportRepository } from "@/repositories/study-report-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { NoEligibleInterviewsError, StudyNotFoundError } from "./errors";

export interface GenerateStudyReportDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
  summaryRepo: SummaryRepository;
  studyReportRepo: StudyReportRepository;
  llm: LLMProviderAdapter;
}

/**
 * Builds a new study report version (T8.1) from every completed interview in
 * the study that has both a transcript and a persisted individual summary.
 * An interview can be `completed` yet still lack a summary (M7's trigger is
 * best-effort and doesn't retry on failure) — such interviews are silently
 * excluded here rather than failing the whole report, since a partial report
 * from what did succeed is more useful than none.
 *
 * Branches on `study.type` — feedback-type studies get a differently-shaped
 * report (whatWorkedWell/whatCouldBeImproved/topicsForFuture/otherInsights
 * instead of `themes`), same dual-field-set pattern already used for
 * `Study`/`Summary`. Feedback-type transcripts are auto-redacted (see
 * interview-export-service) before being sent to the LLM — this report may
 * be shared outside the organization, so participant names/emails are
 * stripped from the source material itself, not just requested in the
 * prompt.
 *
 * Always creates a new `StudyReport` version, never overwrites a prior one —
 * `StudyReportRepository.create` computes the next version number.
 */
export async function generateStudyReport(
  deps: GenerateStudyReportDeps,
  studyId: string,
): Promise<StudyReport> {
  const study = await deps.studyRepo.getById(studyId);
  if (!study) throw new StudyNotFoundError(studyId);

  const interviews = await deps.interviewRepo.listByStudyId(studyId);
  const completed = interviews.filter(
    (interview) => interview.status === "completed" && interview.transcript?.length,
  );

  if (study.type === "feedback") {
    const eligible: FeedbackStudyReportInterviewInput[] = [];
    for (const interview of completed) {
      const summary = await deps.summaryRepo.getByInterviewId(interview.id);
      if (!summary) continue;
      eligible.push({
        interviewId: interview.id,
        transcript: autoRedactTranscript(interview.transcript!, interview.firstName).map(
          (entry) => ({ speaker: entry.speaker, text: entry.text }),
        ),
        summary: {
          liked: summary.liked,
          disliked: summary.disliked,
          suggestions: summary.suggestions,
        },
      });
    }

    if (eligible.length === 0) throw new NoEligibleInterviewsError(studyId);

    const { whatWorkedWell, whatCouldBeImproved, topicsForFuture, otherInsights } =
      await deps.llm.generateFeedbackStudyReport({ interviews: eligible });

    return deps.studyReportRepo.create({
      studyId,
      type: "feedback",
      whatWorkedWell,
      whatCouldBeImproved,
      topicsForFuture,
      otherInsights,
    });
  }

  const eligible: StudyReportInterviewInput[] = [];
  for (const interview of completed) {
    const summary = await deps.summaryRepo.getByInterviewId(interview.id);
    if (!summary) continue;
    eligible.push({
      interviewId: interview.id,
      transcript: interview.transcript!.map((entry) => ({
        speaker: entry.speaker,
        text: entry.text,
      })),
      summary: {
        painPoints: summary.painPoints,
        notableQuotes: summary.notableQuotes,
        takeaways: summary.takeaways,
      },
    });
  }

  if (eligible.length === 0) throw new NoEligibleInterviewsError(studyId);

  const { themes } = await deps.llm.generateStudyReport({ interviews: eligible });

  return deps.studyReportRepo.create({ studyId, type: "discovery", themes });
}
