import { describe, expect, it } from "vitest";
import { buildExtractionSystemPrompt } from "../extraction/prompt";
import { loadRubric } from "../rubric/rubric";

const rubric = loadRubric();

describe("buildExtractionSystemPrompt by channel", () => {
  it("is unchanged for a spoken interview, whether the channel is omitted or 'voice'", () => {
    const omitted = buildExtractionSystemPrompt(rubric);

    expect(buildExtractionSystemPrompt(rubric, "voice")).toBe(omitted);
    expect(omitted).toContain("transcript of a spoken interview");
    expect(omitted).toContain("The transcript is speech-to-text");
  });

  it("describes a typed transcript as typed, not as speech-to-text", () => {
    const prompt = buildExtractionSystemPrompt(rubric, "text");

    expect(prompt).toContain("transcript of a typed chat interview");
    expect(prompt).toContain("The transcript is typed: it may have typos");
    expect(prompt).not.toContain("spoken interview");
    expect(prompt).not.toContain("speech-to-text");
    expect(prompt).not.toContain("stutters");
  });

  it("keeps every other rule and the rubric the same", () => {
    const voice = buildExtractionSystemPrompt(rubric, "voice");
    const text = buildExtractionSystemPrompt(rubric, "text");

    const lines = (prompt: string) => prompt.split("\n");
    const differing = lines(voice).filter((line, i) => line !== lines(text)[i]);
    expect(lines(voice)).toHaveLength(lines(text).length);
    expect(differing).toHaveLength(2);
  });
});
