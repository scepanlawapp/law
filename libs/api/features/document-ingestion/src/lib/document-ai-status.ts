import type { DocumentAiStatus } from "@law/api-interfaces";

/**
 * User-facing AI status of a content row. Content that does not exist yet is
 * pending, so it reads as queued.
 */
export function contentAiStatus(
  content: { status: string } | null | undefined,
): DocumentAiStatus {
  switch (content?.status) {
    case undefined:
    case "PENDING":
      return "QUEUED";
    case "EXTRACTING":
    case "EMBEDDING":
    case "CLASSIFYING":
      return "PROCESSING";
    case "READY":
    case "FAILED":
    case "UNSUPPORTED":
      return content.status;
    default:
      return "QUEUED";
  }
}

/** A document the assistant may not read is OFF whatever its content says. */
export function documentAiStatus(
  aiAccess: boolean,
  content: { status: string } | null | undefined,
): DocumentAiStatus {
  return aiAccess ? contentAiStatus(content) : "OFF";
}
