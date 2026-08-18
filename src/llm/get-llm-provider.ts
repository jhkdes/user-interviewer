import Anthropic from "@anthropic-ai/sdk";
import { ClaudeSonnet46Adapter } from "./claude-sonnet-4-6-adapter";
import type { LLMProviderAdapter } from "./types";

export type LLMProviderFactory = () => LLMProviderAdapter;
export type LLMProviderRegistry = Record<string, LLMProviderFactory>;

const DEFAULT_PROVIDER_NAME = "claude-sonnet-4-6";

const defaultRegistry: LLMProviderRegistry = {
  [DEFAULT_PROVIDER_NAME]: () => new ClaudeSonnet46Adapter(new Anthropic()),
};

/**
 * Resolves the active LLMProviderAdapter from the `LLM_PROVIDER` env var
 * (defaulting to Claude Sonnet 4.6). Every call site — Interview Agent,
 * Summary Service, Study Report Service — depends only on this function and
 * the LLMProviderAdapter interface, never on a concrete provider class, so
 * switching models is a config change here, not an edit at every call site.
 *
 * `env`/`registry` are overridable (not just for testing a real switch —
 * see the get-llm-provider tests) rather than mutating a shared module-level
 * registry, so tests can't leak provider registrations into each other.
 */
export function getLLMProvider(
  env: Record<string, string | undefined> = process.env,
  registry: LLMProviderRegistry = defaultRegistry,
): LLMProviderAdapter {
  const name = env.LLM_PROVIDER ?? DEFAULT_PROVIDER_NAME;
  const factory = registry[name];
  if (!factory) {
    throw new Error(
      `Unknown LLM_PROVIDER "${name}". Registered providers: ${Object.keys(registry).join(", ")}`,
    );
  }
  return factory();
}
