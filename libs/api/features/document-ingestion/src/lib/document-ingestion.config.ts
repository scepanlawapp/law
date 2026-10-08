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
