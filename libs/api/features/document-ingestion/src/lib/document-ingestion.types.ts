export const DOCUMENT_INGEST_QUEUE = "document-ingest";

/** Bump when the ingestion pipeline changes so READY content is reprocessed. */
export const CURRENT_PIPELINE_VERSION = 1;

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
