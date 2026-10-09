import { Injectable, Logger } from "@nestjs/common";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { WorkspaceRole } from "@law/api-interfaces";
import {
  PlatformPrismaService,
  WorkspaceContext,
  WorkspaceContextService,
} from "@law/core";
import { DocumentContentEvents } from "./document-content.events";
import { DocumentIngestionPipeline } from "./document-ingestion.pipeline";
import {
  DOCUMENT_INGEST_QUEUE,
  DocumentIngestPayload,
} from "./document-ingestion.types";

/**
 * BullMQ consumer for `document-ingest`. A thrown error is retried by BullMQ
 * with backoff; once attempts are exhausted the content is marked FAILED with
 * the step that was active.
 */
@Injectable()
@Processor(DOCUMENT_INGEST_QUEUE)
export class DocumentIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentIngestionProcessor.name);

  constructor(
    private readonly pipeline: DocumentIngestionPipeline,
    private readonly prisma: PlatformPrismaService,
    private readonly events: DocumentContentEvents,
    private readonly workspaceContextService: WorkspaceContextService,
  ) {
    super();
  }

  async process(job: Job<DocumentIngestPayload>): Promise<void> {
    const { workspaceId, contentId } = job.data;
    const context: WorkspaceContext = {
      userId: "system-document-ingestion",
      workspaceId,
      role: WorkspaceRole.ADMIN,
    };
    await this.workspaceContextService.run(context, () =>
      this.pipeline.run(workspaceId, contentId),
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<DocumentIngestPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) return; // BullMQ will retry

    const { workspaceId, contentId } = job.data;
    try {
      const content = await this.prisma.documentContent.findFirst({
        where: { id: contentId, workspaceId },
        select: { status: true },
      });
      if (
        !content ||
        content.status === "READY" ||
        content.status === "UNSUPPORTED"
      ) {
        return;
      }
      await this.prisma.documentContent.updateMany({
        where: { id: contentId, workspaceId },
        data: {
          status: "FAILED",
          failedStep: content.status,
          error: error.message,
        },
      });
      this.events.emit({ workspaceId, contentId, status: "FAILED" });
    } catch (updateError) {
      this.logger.error(
        `Failed to record final failure for content ${contentId}: ${
          updateError instanceof Error ? updateError.message : updateError
        }`,
      );
    }
  }
}
