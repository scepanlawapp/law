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

/** A PENDING content older than this is presumed lost (no job will pick it up). */
export const STALE_PENDING_MS = 10 * 60_000;

/**
 * Whether a content can be sent through the pipeline again by hand: it failed,
 * it sat PENDING long enough that its job was probably lost (queue outage,
 * Redis flush), or it finished READY but still owes classification or facts.
 * No content row at all (a version from before ingestion that was never
 * backfilled) is retryable too: reprocessing links the content first. Callers
 * decide whether a document without a current version applies.
 */
export function isContentRetryable(
  content:
    | {
        status: string;
        failedStep?: string | null;
        updatedAt?: Date | null;
      }
    | null
    | undefined,
  now: Date = new Date(),
): boolean {
  if (!content) return true;
  switch (content.status) {
    case "FAILED":
      return true;
    case "PENDING":
      return (
        !!content.updatedAt &&
        now.getTime() - content.updatedAt.getTime() > STALE_PENDING_MS
      );
    case "READY":
      return !!content.failedStep;
    default:
      return false;
  }
}
