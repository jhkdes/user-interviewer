import type { Interview, Study, StudyReport, StudyReportTheme, Summary } from "@/domain";
import { redactIdentity } from "./redact-identity";
import type {
  ViewerInterview,
  ViewerReportTheme,
  ViewerStudy,
  ViewerStudyReport,
  ViewerSummary,
} from "./viewer-types";

/**
 * Study configuration a viewer may read: the goals and questions. The
 * participant links, the custom interviewer prompt and the participant page
 * copy are left out — a link would let a viewer start interviews of their own.
 */
export function toViewerStudy(study: Study): ViewerStudy {
  return {
    id: study.id,
    type: study.type,
    title: study.title,
    description: study.description,
    status: study.status,
    researchTopic: study.researchTopic,
    preInterviewQuestions: study.preInterviewQuestions.map((q) => ({
      id: q.id,
      label: q.label,
      options: q.options,
    })),
    feedbackQuestions: study.feedbackQuestions,
    createdAt: study.createdAt.toISOString(),
  };
}

export function toViewerSummary(summary: Summary, firstNames: readonly string[]): ViewerSummary {
  const clean = (items: string[]) => items.map((t) => redactIdentity(t, firstNames));
  return {
    type: summary.type,
    painPoints: clean(summary.painPoints),
    notableQuotes: clean(summary.notableQuotes),
    takeaways: clean(summary.takeaways),
    liked: clean(summary.liked),
    disliked: clean(summary.disliked),
    suggestions: clean(summary.suggestions),
  };
}

export function toViewerStudyReport(
  report: StudyReport,
  firstNames: readonly string[],
): ViewerStudyReport {
  const clean = (themes: StudyReportTheme[]): ViewerReportTheme[] =>
    themes.map((t) => ({
      theme: redactIdentity(t.theme, firstNames),
      participantCount: t.participantCount,
      representativeQuotes: t.representativeQuotes.map((q) => redactIdentity(q, firstNames)),
    }));
  return {
    version: report.version,
    type: report.type,
    themes: clean(report.themes),
    whatWorkedWell: clean(report.whatWorkedWell),
    whatCouldBeImproved: clean(report.whatCouldBeImproved),
    topicsForFuture: clean(report.topicsForFuture),
    otherInsights: clean(report.otherInsights),
    generatedAt: report.generatedAt.toISOString(),
  };
}

export function toViewerInterview(
  interview: Interview,
  position: number,
  summary: Summary | null,
): ViewerInterview {
  const names = [interview.firstName];
  const redact = (text: string) => redactIdentity(text, names);

  const durationSeconds =
    interview.startedAt && interview.completedAt
      ? Math.round((interview.completedAt.getTime() - interview.startedAt.getTime()) / 1000)
      : null;

  return {
    id: interview.id,
    label: `Participant ${position}`,
    mode: interview.mode,
    createdAt: interview.createdAt.toISOString(),
    completedAt: interview.completedAt?.toISOString() ?? null,
    durationSeconds,
    roleDescription: interview.roleDescription ? redact(interview.roleDescription) : null,
    screenerAnswers: interview.screenerAnswers
      ? Object.fromEntries(
          Object.entries(interview.screenerAnswers).map(([id, answer]) => [
            id,
            Array.isArray(answer) ? answer.map(redact) : redact(answer),
          ]),
        )
      : null,
    transcript: interview.transcript
      ? interview.transcript.map((entry) => ({
          speaker: entry.speaker,
          text: redact(entry.text),
          timestampMs: entry.timestampMs,
        }))
      : null,
    hasRecording:
      interview.mode === "voice" &&
      Boolean(interview.vapiCallId || interview.elevenLabsConversationId || interview.recordingUrl),
    summary: summary ? toViewerSummary(summary, names) : null,
  };
}
