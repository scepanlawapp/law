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
    const jobId = documentIngestJobId(contentId);
    // A finished job keeps its id in Redis (removeOnFail is false), and
    // `add` with an existing id is a silent no-op. Clear it so a failed
    // content can be retried; waiting, active and delayed jobs stay put and
    // absorb the duplicate request without a second add.
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "failed" && state !== "completed") return;
      await existing.remove();
    }
    await this.queue.add(
      "ingest",
      { workspaceId, contentId },
      {
        jobId,
        ...DOCUMENT_INGEST_JOB_OPTIONS,
        backoff: { ...DOCUMENT_INGEST_JOB_OPTIONS.backoff },
      },
    );
  }
}
