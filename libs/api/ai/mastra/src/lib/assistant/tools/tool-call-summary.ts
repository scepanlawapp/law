import { isDraftDocumentType } from "@law/api-interfaces";
import { getDocumentType } from "@law/brief-extraction";
import {
  getContractChecklist,
  isContractReviewType,
} from "@law/contract-review";
import { CREATE_DEADLINE_TOOL_ID } from "./create-deadline.tool";
import { DETECT_DEADLINES_TOOL_ID } from "./detect-deadlines.tool";
import { DRAFT_DOCUMENT_TOOL_ID } from "./draft-document.tool";
import { GET_AGENDA_TOOL_ID } from "./get-agenda.tool";
import { GET_CASE_TOOL_ID } from "./get-case.tool";
import { GET_CLIENT_TOOL_ID } from "./get-client.tool";
import { LINK_CASE_TOOL_ID } from "./link-case.tool";
import { LIST_ACTIVITY_TOOL_ID } from "./list-activity.tool";
import { LIST_DOCUMENTS_TOOL_ID } from "./list-documents.tool";
import { LIST_DRAFTS_TOOL_ID } from "./list-drafts.tool";
import { LIST_WORK_ITEMS_TOOL_ID } from "./list-work-items.tool";
import { READ_DOCUMENT_TOOL_ID } from "./read-document.tool";
import { REVIEW_CONTRACT_TOOL_ID } from "./review-contract.tool";
import { REVISE_DRAFT_TOOL_ID } from "./revise-draft.tool";
import { SEARCH_CASES_TOOL_ID } from "./search-cases.tool";
import { SEARCH_CLIENTS_TOOL_ID } from "./search-clients.tool";
import { SEARCH_DOCUMENTS_TOOL_ID } from "./search-documents.tool";
import { SEARCH_LEGAL_SOURCES_TOOL_ID } from "./search-legal-sources.tool";
import { SUMMARIZE_CASE_DOCUMENTS_TOOL_ID } from "./summarize-case-documents.tool";

const LABEL_MAX_CHARS = 120;

function contractTypeLabel(value: unknown): string | null {
  return isContractReviewType(value) ? getContractChecklist(value).label : null;
}

function documentTypeLabel(value: unknown): string | null {
  return isDraftDocumentType(value) ? getDocumentType(value).label : null;
}

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
    case DRAFT_DOCUMENT_TOOL_ID:
      return joined(documentTypeLabel(args?.["documentType"]), args?.["note"]);
    case REVISE_DRAFT_TOOL_ID:
      return clip(args?.["instruction"]);
    case REVIEW_CONTRACT_TOOL_ID:
      return joined(contractTypeLabel(args?.["contractType"]), args?.["focus"]);
    case SUMMARIZE_CASE_DOCUMENTS_TOOL_ID:
      return clip(args?.["focus"]);
    case DETECT_DEADLINES_TOOL_ID:
      return clip(args?.["serviceDate"]);
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
    case SUMMARIZE_CASE_DOCUMENTS_TOOL_ID:
      // Events in the timeline.
      return result["status"] === "TIMELINE_READY" &&
        typeof result["eventCount"] === "number"
        ? result["eventCount"]
        : null;
    case REVIEW_CONTRACT_TOOL_ID: {
      // Findings in the review.
      const counts = record(result["issueCounts"]);
      return result["status"] === "REVIEW_READY" && counts
        ? Number(counts["high"] ?? 0) +
            Number(counts["medium"] ?? 0) +
            Number(counts["low"] ?? 0)
        : null;
    }
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
