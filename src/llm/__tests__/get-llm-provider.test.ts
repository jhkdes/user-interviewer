import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "../fake-llm-provider";
import { getLLMProvider, type LLMProviderRegistry } from "../get-llm-provider";
import type { LLMProviderAdapter } from "../types";

/** A second, unrelated provider implementation to prove the selection mechanism is generic. */
class DummyProvider implements LLMProviderAdapter {
  async generateInterviewerTurn() {
    return { utterance: "dummy", shouldEndInterview: false };
  }
  async *generateInterviewerTurnStreaming() {
    yield {
      type: "done" as const,
      utterance: "dummy",
      shouldEndInterview: false,
      participantRequestedEnd: false,
    };
  }
  async generateSummary() {
    return { painPoints: [], notableQuotes: [], takeaways: [], roleDescription: null };
  }
  async generateStudyReport() {
    return { themes: [] };
  }
}

/** Simulates a call site — code that only knows about LLMProviderAdapter, never a concrete class. */
async function callSiteUsesWhicheverProviderIsConfigured(
  provider: LLMProviderAdapter,
): Promise<string> {
  const turn = await provider.generateInterviewerTurn({
    systemPrompt: "prompt",
    conversationHistory: [],
  });
  return turn.utterance;
}

describe("getLLMProvider", () => {
  it("defaults to claude-sonnet-4-6 when LLM_PROVIDER is unset", () => {
    const provider = getLLMProvider(
      {},
      {
        "claude-sonnet-4-6": () => new DummyProvider(),
      },
    );
    expect(provider).toBeInstanceOf(DummyProvider);
  });

  it("selects a provider by the LLM_PROVIDER env var, with the call site unchanged", async () => {
    const registry: LLMProviderRegistry = {
      "claude-sonnet-4-6": () => new DummyProvider(),
      "fake-for-test": () => {
        const fake = new FakeLLMProvider();
        fake.scriptInterviewerTurns([
          { utterance: "scripted response", shouldEndInterview: false },
        ]);
        return fake;
      },
    };

    const defaultProvider = getLLMProvider({}, registry);
    const swappedProvider = getLLMProvider({ LLM_PROVIDER: "fake-for-test" }, registry);

    // Same call-site function, two different configured providers — no branching on provider identity.
    expect(await callSiteUsesWhicheverProviderIsConfigured(defaultProvider)).toBe("dummy");
    expect(await callSiteUsesWhicheverProviderIsConfigured(swappedProvider)).toBe(
      "scripted response",
    );
  });

  it("throws a clear error for an unregistered provider name", () => {
    expect(() => getLLMProvider({ LLM_PROVIDER: "does-not-exist" }, {})).toThrow(
      /Unknown LLM_PROVIDER "does-not-exist"/,
    );
  });
});
