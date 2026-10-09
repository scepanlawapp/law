import type { PrismaClient } from "@prisma/client";
import {
  CURRENT_PIPELINE_VERSION,
  DEFAULT_EMBEDDING_MODEL,
  isIngestionCurrent,
} from "../libs/api/features/document-ingestion/src/lib/document-ingestion.types";

export interface ReindexOptions {
  /** Only content below `CURRENT_PIPELINE_VERSION`; READY rows on it are skipped either way. */
  pipelineVersionOnly: boolean;
  /** Count candidates without enqueueing anything. */
  dryRun: boolean;
  /**
   * Embedding model in use now (`LEGAL_EMBEDDING_MODEL`); READY content from
   * another model is stale. Defaults to the platform default.
   */
  embeddingModel?: string;
}

export interface ReindexResult {
  candidates: number;
  enqueued: number;
  /** Content ids selected (for dry-run inspection). */
  candidateIds: string[];
}

export type EnqueueIngestion = (
  workspaceId: string,
  contentId: string,
) => Promise<void>;

const PAGE_SIZE = 500;

export function parseReindexArgs(argv: string[]): ReindexOptions {
  const options: ReindexOptions = { pipelineVersionOnly: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--only-opted-in") continue; // the only mode; accepted for clarity
    if (arg === "--pipeline-version") options.pipelineVersionOnly = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

/**
 * Enqueues ingestion for content that an AI-readable source points at: current
 * versions of non-archived documents with `aiAccess = true` (any version) and
 * chat attachments that are unfiled or filed as such a document. Content
 * reachable only through access-off documents is never enqueued, nor is that
 * of chat sessions the user deleted. Content that is READY, on the current
 * pipeline version, embedded by the current model and without a retry marker
 * is skipped, matching `DocumentContentService.requestIngestion`.
 */
export async function reindexDocumentContent(
  prisma: PrismaClient,
  enqueue: EnqueueIngestion,
  options: ReindexOptions,
): Promise<ReindexResult> {
  const embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const byWorkspace = new Map<string, Set<string>>();
  const add = (workspaceId: string, contentId: string | null) => {
    if (!contentId) return;
    const ids = byWorkspace.get(workspaceId) ?? new Set<string>();
    ids.add(contentId);
    byWorkspace.set(workspaceId, ids);
  };

  let cursor = "";
  for (;;) {
    const rows = await prisma.documentVersion.findMany({
      where: {
        contentId: { not: null },
        document: { aiAccess: true, archivedAt: null },
        id: { gt: cursor },
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: { id: true, workspaceId: true, contentId: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    rows.forEach((row) => add(row.workspaceId, row.contentId));
  }

  cursor = "";
  for (;;) {
    const rows = await prisma.chatAttachment.findMany({
      where: {
        contentId: { not: null },
        id: { gt: cursor },
        // A deleted conversation's files are no longer the user's to be read.
        session: { isDeleted: false },
        // Unfiled attachments are readable; filed ones follow their document.
        OR: [
          { documentId: null },
          { document: { aiAccess: true, archivedAt: null } },
        ],
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: { id: true, workspaceId: true, contentId: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    rows.forEach((row) => add(row.workspaceId, row.contentId));
  }

  const result: ReindexResult = {
    candidates: 0,
    enqueued: 0,
    candidateIds: [],
  };
  for (const [workspaceId, ids] of byWorkspace) {
    const all = [...ids];
    for (let i = 0; i < all.length; i += PAGE_SIZE) {
      const contents = await prisma.documentContent.findMany({
        where: { id: { in: all.slice(i, i + PAGE_SIZE) }, workspaceId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          pipelineVersion: true,
          failedStep: true,
          embeddingModel: true,
        },
      });
      for (const content of contents) {
        if (content.status === "UNSUPPORTED") continue;
        const outdated =
          content.pipelineVersion < CURRENT_PIPELINE_VERSION ||
          (content.status === "READY" &&
            content.embeddingModel !== embeddingModel);
        if (
          options.pipelineVersionOnly
            ? !outdated
            : isIngestionCurrent(content, embeddingModel)
        ) {
          continue;
        }
        result.candidates += 1;
        result.candidateIds.push(content.id);
        if (options.dryRun) continue;
        await enqueue(workspaceId, content.id);
        result.enqueued += 1;
      }
    }
  }
  return result;
}
