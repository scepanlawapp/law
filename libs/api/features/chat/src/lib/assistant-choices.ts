import type { AssistantChoice } from "@law/api-interfaces";

export const MAX_CHOICES = 5;
const MAX_TEXT = 200;

/**
 * One-click choices a tool result offers (ambiguous names, cases, events), or
 * null. Malformed entries are dropped; at most five are kept.
 */
export function toolChoices(output: unknown): AssistantChoice[] | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const raw = (output as { choices?: unknown }).choices;
  if (!Array.isArray(raw)) return null;
  const choices = raw
    .filter(
      (item): item is AssistantChoice =>
        !!item &&
        typeof (item as AssistantChoice).label === "string" &&
        typeof (item as AssistantChoice).reply === "string" &&
        !!(item as AssistantChoice).label.trim() &&
        !!(item as AssistantChoice).reply.trim(),
    )
    .slice(0, MAX_CHOICES)
    .map((item) => ({
      label: item.label.trim().slice(0, MAX_TEXT),
      reply: item.reply.trim().slice(0, MAX_TEXT),
    }));
  return choices.length ? choices : null;
}

/** Choices stored on an assistant message, or an empty list. */
export function choicesFromMetadata(metadata: unknown): AssistantChoice[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return toolChoices({ choices: (metadata as { choices?: unknown }).choices }) ?? [];
}
