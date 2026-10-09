export const DOCUMENT_INGEST_QUEUE = "document-ingest";

/** Bump when the ingestion pipeline changes so READY content is reprocessed. */
export const CURRENT_PIPELINE_VERSION = 1;

/** Embedding model used when `LEGAL_EMBEDDING_MODEL` is not set. */
export const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";

/**
 * Whether ingestion has nothing left to do for a content: READY on the current
 * pipeline version, with no step marked for retry, embedded by the model in
 * use now. Content embedded by another model is stale (its vectors cannot be
 * compared with query vectors of the current model) and is re-ingested.
 */
export function isIngestionCurrent(
  content: {
    status: string;
    pipelineVersion: number;
    failedStep?: string | null;
    embeddingModel?: string | null;
  },
  embeddingModel: string,
): boolean {
  return (
    content.status === "READY" &&
    content.pipelineVersion >= CURRENT_PIPELINE_VERSION &&
    !content.failedStep && // READY with a marker still owes classify/facts
    content.embeddingModel === embeddingModel
  );
}

/** Lean job payload: the processor reloads everything else from Postgres. */
export interface DocumentIngestPayload {
  workspaceId: string;
  contentId: string;
}

export type ContentTextStatus =
  | "COMPLETED"
  | "FAILED"
  | "UNSUPPORTED"
  | "UNAVAILABLE";

export interface ContentText {
  status: ContentTextStatus;
  /** Serbian Latin; present only when `status` is `COMPLETED`. */
  text: string | null;
}
