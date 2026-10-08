import { Injectable } from "@nestjs/common";

/** BullMQ options for every `document-ingest` job. */
export const DOCUMENT_INGEST_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

export function documentIngestJobId(contentId: string): string {
  return `content:${contentId}`;
}

/** Env-driven ingestion thresholds. */
@Injectable()
export class DocumentIngestionConfig {
  /** Classifications below this confidence fall back to OTHER. */
  readonly documentKindMinConfidence = numberFromEnv(
    process.env.DOCUMENT_KIND_MIN_CONFIDENCE,
    0.6,
  );
  /** Only this many leading characters of a text are chunked and embedded. */
  readonly documentEmbedMaxChars = numberFromEnv(
    process.env.DOCUMENT_EMBED_MAX_CHARS,
    200_000,
  );
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
