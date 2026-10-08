import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  DOCUMENT_INGEST_JOB_OPTIONS,
  documentIngestJobId,
} from "./document-ingestion.config";
import {
  DOCUMENT_INGEST_QUEUE,
  DocumentIngestPayload,
} from "./document-ingestion.types";

/**
 * Producer port for the BullMQ `document-ingest` queue. The jobId is derived
 * from the content id, so repeated requests collapse onto one pending job.
 */
@Injectable()
export class DocumentIngestionQueue {
  constructor(
    @InjectQueue(DOCUMENT_INGEST_QUEUE)
    private readonly queue: Queue<DocumentIngestPayload>,
  ) {}

  async enqueue(workspaceId: string, contentId: string): Promise<void> {
    await this.queue.add(
      "ingest",
      { workspaceId, contentId },
      {
        jobId: documentIngestJobId(contentId),
        ...DOCUMENT_INGEST_JOB_OPTIONS,
        backoff: { ...DOCUMENT_INGEST_JOB_OPTIONS.backoff },
      },
    );
  }
}
