import { CREATE_DEADLINE_TOOL_ID } from "./create-deadline.tool";
import { DRAFT_LAWSUIT_TOOL_ID } from "./draft-lawsuit.tool";
import { GET_AGENDA_TOOL_ID } from "./get-agenda.tool";
import { GET_CASE_TOOL_ID } from "./get-case.tool";
import { GET_CLIENT_TOOL_ID } from "./get-client.tool";
import { LINK_CASE_TOOL_ID } from "./link-case.tool";
import { LIST_ACTIVITY_TOOL_ID } from "./list-activity.tool";
import { LIST_DOCUMENTS_TOOL_ID } from "./list-documents.tool";
import { LIST_DRAFTS_TOOL_ID } from "./list-drafts.tool";
import { LIST_WORK_ITEMS_TOOL_ID } from "./list-work-items.tool";
import { READ_DOCUMENT_TOOL_ID } from "./read-document.tool";
import { REVISE_DRAFT_TOOL_ID } from "./revise-draft.tool";
import { SEARCH_CASES_TOOL_ID } from "./search-cases.tool";
import { SEARCH_CLIENTS_TOOL_ID } from "./search-clients.tool";
import { SEARCH_DOCUMENTS_TOOL_ID } from "./search-documents.tool";
import { SEARCH_LEGAL_SOURCES_TOOL_ID } from "./search-legal-sources.tool";

const LABEL_MAX_CHARS = 120;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function joined(...values: unknown[]): string | null {
  return clip(
    values.filter((value) => typeof value === "string" && value).join(" · "),
  );
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
    case GET_CLIENT_TOOL_ID:
      return clip(args?.["reference"]);
    case SEARCH_CASES_TOOL_ID:
      return joined(args?.["query"], args?.["client"], args?.["responsible"]);
    case SEARCH_CLIENTS_TOOL_ID:
      return joined(args?.["query"], args?.["responsible"]);
    case LIST_WORK_ITEMS_TOOL_ID:
      return joined(args?.["case"], args?.["client"], args?.["person"]);
    case GET_AGENDA_TOOL_ID:
      return joined(
        args?.["from"] && args?.["to"]
          ? `${args["from"]} – ${args["to"]}`
          : null,
        args?.["person"] === "me" ? null : args?.["person"],
      );
    case LIST_ACTIVITY_TOOL_ID:
      return joined(args?.["case"], args?.["client"]);
    case SEARCH_DOCUMENTS_TOOL_ID:
      return clip(args?.["query"]);
    case DRAFT_LAWSUIT_TOOL_ID:
      return clip(args?.["note"]);
    case REVISE_DRAFT_TOOL_ID:
      return clip(args?.["instruction"]);
    case LINK_CASE_TOOL_ID:
      return clip(args?.["caseReference"]);
    case CREATE_DEADLINE_TOOL_ID:
      return clip(
        [args?.["title"], args?.["dueDate"]].filter(Boolean).join(" · "),
      );
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
    case GET_CLIENT_TOOL_ID:
      return result["found"] === "one"
        ? 1
        : result["found"] === "many" && Array.isArray(result["candidates"])
          ? result["candidates"].length
          : result["found"] === "none"
            ? 0
            : null;
    case LIST_DRAFTS_TOOL_ID:
      return Array.isArray(result["drafts"]) ? result["drafts"].length : null;
    case LIST_DOCUMENTS_TOOL_ID:
      return result["status"] === "OK" && Array.isArray(result["items"])
        ? result["items"].length
        : 0;
    case READ_DOCUMENT_TOOL_ID:
      return result["status"] === "OK" ? 1 : 0;
    case SEARCH_DOCUMENTS_TOOL_ID:
      return result["status"] === "OK" && Array.isArray(result["matches"])
        ? result["matches"].reduce(
            (sum: number, match: unknown) =>
              sum + Number(record(match)?.["count"] ?? 0),
            0,
          )
        : 0;
    case SEARCH_CASES_TOOL_ID:
    case SEARCH_CLIENTS_TOOL_ID:
    case LIST_WORK_ITEMS_TOOL_ID:
    case GET_AGENDA_TOOL_ID:
    case LIST_ACTIVITY_TOOL_ID:
      return result["status"] !== "OK"
        ? 0
        : typeof result["total"] === "number"
          ? result["total"]
          : null;
    default:
      return null;
  }
}
