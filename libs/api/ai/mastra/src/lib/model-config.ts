import type { OpenAICompatibleConfig } from "@mastra/core/llm";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterModelOptions {
  apiKey: string;
  /** OpenRouter model id as configured today, e.g. `openai/gpt-4o-mini`. */
  model: string;
  baseUrl?: string;
}

/**
 * Maps an OpenRouter model id (`openai/gpt-4o-mini`, `openrouter/auto`) to a
 * Mastra model-router id. Always prefixed, so `openrouter/auto` becomes
 * `openrouter/openrouter/auto` and still resolves to model `openrouter/auto`.
 */
export function toModelRouterId(model: string): `openrouter/${string}` {
  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error("OpenRouter model id is required");
  }
  return `openrouter/${trimmed}`;
}

/**
 * Model config for Mastra agents. The explicit `url` makes Mastra call the
 * configured OpenRouter endpoint as an OpenAI-compatible API (same as the
 * legacy adapter) instead of resolving the provider through its gateway
 * registry.
 */
export function openRouterModel(
  options: OpenRouterModelOptions,
): OpenAICompatibleConfig {
  return {
    id: toModelRouterId(options.model),
    apiKey: options.apiKey,
    url: (options.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}
