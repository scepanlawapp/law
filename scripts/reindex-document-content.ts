import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { DocumentIngestionQueue } from "../libs/api/features/document-ingestion/src/lib/document-ingestion.queue";
import {
  DOCUMENT_INGEST_QUEUE,
  DocumentIngestPayload,
} from "../libs/api/features/document-ingestion/src/lib/document-ingestion.types";
import {
  parseReindexArgs,
  reindexDocumentContent,
} from "./document-content-reindex";

/**
 * `npm run documents:reindex-content -- [--only-opted-in] [--pipeline-version] [--dry-run]`
 *
 * Enqueues ingestion on the BullMQ `document-ingest` queue for content of
 * access-on documents and chat attachments. The API process runs the
 * processor, so Redis and the API must be up for jobs to complete.
 */
async function main(): Promise<void> {
  const options = parseReindexArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  // Same Redis options as QueueRootModule.
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const queue = new Queue<DocumentIngestPayload>(DOCUMENT_INGEST_QUEUE, {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    },
  });

  try {
    // The producer class is plain constructor injection, so reuse it as is.
    const producer = new DocumentIngestionQueue(queue);
    const result = await reindexDocumentContent(
      prisma,
      (workspaceId, contentId) => producer.enqueue(workspaceId, contentId),
      options,
    );
    console.log(JSON.stringify({ ...options, ...result }, null, 2));
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
