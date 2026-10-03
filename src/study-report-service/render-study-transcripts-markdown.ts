import type { Interview, Study } from "@/domain";
import { resolveScreenerAnswers } from "@/interview-export-service";
import { formatDuration } from "@/lib/format-duration";

function renderStudyQuestionsSection(lines: string[], study: Study): void {
  if (study.type === "feedback" && study.feedbackQuestions.length > 0) {
    lines.push("## Study questions", "");
    for (const question of study.feedbackQuestions) {
      lines.push(`- ${question}`);
    }
    lines.push("");
  } else if (study.type === "discovery" && study.researchTopic) {
    lines.push("## Study questions", "", `Research focus: ${study.researchTopic}`, "");
  }
}

/**
 * Renders every eligible interview's raw transcript in one standalone
 * Markdown document, for the "download all transcripts" option on the study
 * detail page — meant to be pasted/uploaded as LLM context for the PM's own
 * ad hoc analysis, not shared externally, so (unlike the printable
 * single-interview export) this deliberately does not redact anything:
 * participant first names are used as-is to label each section. No
 * summaries are included — raw transcripts and pre-interview questionnaire
 * answers only, per study decision. Pure and synchronous — no I/O.
 */
export function renderStudyTranscriptsMarkdown(study: Study, interviews: Interview[]): string {
  const lines: string[] = [`# ${study.title || "(untitled study)"}`, ""];

  if (study.description) {
    lines.push(study.description, "");
  }

  renderStudyQuestionsSection(lines, study);

  const eligible = [...interviews]
    .filter((interview) => interview.transcript && interview.transcript.length > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (eligible.length === 0) {
    lines.push("_No interviews with a transcript yet._", "");
    return lines.join("\n").trimEnd() + "\n";
  }

  eligible.forEach((interview, index) => {
    const transcript = interview.transcript!;
    const roleSuffix = interview.roleDescription ? ` — ${interview.roleDescription}` : "";

    lines.push("---", "", `## Participant ${index + 1}: ${interview.firstName}${roleSuffix}`, "");

    // Written answers read differently from spoken ones (shorter, no filler),
    // which matters when this is fed to an LLM for analysis.
    if (interview.mode === "text") {
      lines.push("_Interview mode: typed (written chat), not voice._", "");
    }

    const answers = resolveScreenerAnswers(study, interview);
    if (answers.length > 0) {
      lines.push("### Pre-interview questionnaire", "");
      for (const { label, answer } of answers) {
        lines.push(`- **${label}**: ${answer}`);
      }
      lines.push("");
    }

    lines.push("### Transcript", "");
    for (const entry of transcript) {
      const speaker = entry.speaker === "interviewer" ? "Interviewer" : interview.firstName;
      lines.push(`[${formatDuration(entry.timestampMs / 1000)}] ${speaker}: ${entry.text}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}
