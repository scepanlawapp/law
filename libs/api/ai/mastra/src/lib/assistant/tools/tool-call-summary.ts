import { GET_CASE_TOOL_ID } from "./get-case.tool";
import { SEARCH_LEGAL_SOURCES_TOOL_ID } from "./search-legal-sources.tool";

const LABEL_MAX_CHARS = 120;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clip(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > LABEL_MAX_CHARS
    ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…`
    : text;
}

/** Short human-readable argument of a tool call for the activity UI. */
export function describeToolCall(
  toolName: string,
  input: unknown,
): string | null {
  const args = record(input);
  switch (toolName) {
    case SEARCH_LEGAL_SOURCES_TOOL_ID:
      return clip(args?.["query"]);
    case GET_CASE_TOOL_ID:
      return clip(args?.["reference"]);
    default:
      return null;
  }
}

/** Number of results a tool returned, or null when not meaningful. */
export function toolResultCount(
  toolName: string,
  output: unknown,
): number | null {
  const result = record(output);
  if (!result) return null;
  switch (toolName) {
    case SEARCH_LEGAL_SOURCES_TOOL_ID:
      return typeof result["count"] === "number" ? result["count"] : null;
    case GET_CASE_TOOL_ID:
      return result["found"] === "one"
        ? 1
        : result["found"] === "many" && Array.isArray(result["candidates"])
          ? result["candidates"].length
          : result["found"] === "none"
            ? 0
            : null;
    default:
      return null;
  }
}
