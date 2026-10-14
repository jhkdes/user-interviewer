import { describe, expect, it } from "vitest";
import type { Study } from "@/domain";
import { buildInterviewSystemPrompt } from "@/interview-agent/system-prompt";
import { DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS } from "@/interview-agent/termination";
import { MIN_PARTICIPANT_TURNS_FOR_REPORT } from "@/job-search-study/min-turns";
import { discoveryTextMinTurns } from "../generate-turn";

const study = (reportPipeline: Study["reportPipeline"]) => ({ reportPipeline }) as Study;

describe("discoveryTextMinTurns", () => {
  it("is 12 for an ordinary study", () => {
    expect(discoveryTextMinTurns(study(null))).toBe(12);
    expect(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS).toBe(12);
  });

  it("is the report's own minimum for a study that makes job-search reports", () => {
    expect(discoveryTextMinTurns(study("job-search"))).toBe(MIN_PARTICIPANT_TURNS_FOR_REPORT);
    expect(MIN_PARTICIPANT_TURNS_FOR_REPORT).toBeGreaterThanOrEqual(
      DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS,
    );
  });
});

describe("the chat prompt's wrap-up floor", () => {
  const context = {
    participantFirstName: "Sam",
    participantRoleDescription: null,
    studyTitle: "T",
    studyDescription: "d",
    researchTopic: null,
    customPrompt: null,
    screenerAnswers: null,
    isDecisionTurn: false,
    isFinalWrapTurn: false,
    channel: "text" as const,
  };

  it("tells the model the number the study needs, for the generated and the custom prompt", () => {
    for (const customPrompt of [null, "Interview {{participant_name}}."]) {
      const prompt = buildInterviewSystemPrompt({
        ...context,
        customPrompt,
        minParticipantTurns: 14,
      });
      expect(prompt).toContain("at least 14 messages");
      expect(prompt).not.toContain("at least 12 messages");
    }
  });

  it("defaults to 12", () => {
    expect(buildInterviewSystemPrompt(context)).toContain("at least 12 messages");
  });
});
