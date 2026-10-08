import { createHash } from "node:crypto";
import {
  Prisma,
  type ChatAttachmentExtractionStatus,
  type ChatAttachmentSourceScript,
  type PrismaClient,
} from "@prisma/client";

/**
 * Backfill for the case document ingestion epic. Idempotent: rows are only
 * visited while `contentId` is null, and every counter reports work actually
 * done, so a second run on a settled database prints zeros.
 *
 * Never calls an extraction, OCR, LLM or embedding provider. Legacy extracted
 * text is copied verbatim; reprocessing is the separate reindex command.
 */

export interface BackfillDeps {
  /** Bytes of a workspace document's stored file. */
  readStoredFile(workspaceId: string, storedFileId: string): Promise<Buffer>;
  /** Bytes of a chat attachment on the dedicated chat-upload layout. */
  readChatAttachment(row: {
    workspaceId: string;
    sessionId: string;
    storedName: string;
  }): Promise<Buffer>;
}

export interface BackfillResult {
  versionsLinked: number;
  attachmentsLinked: number;
  contentsCreated: number;
  textCopied: number;
  documentsOptedIn: number;
  markedUnsupported: number;
  /** Rows left unlinked because their bytes could not be read to hash them. */
  unreadable: number;
}

export interface BackfillLogger {
  warn(message: string): void;
}

const PAGE_SIZE = 200;
const DEFAULT_MIME = "application/octet-stream";

type LegacyExtraction = {
  extractionStatus: ChatAttachmentExtractionStatus;
  extractedText: string | null;
  sourceScript: ChatAttachmentSourceScript | null;
  extractionError: string | null;
};

type ContentRef = {
  id: string;
  status: string;
  extractedText: string | null;
};

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function backfillDocumentContent(
  prisma: PrismaClient,
  deps: BackfillDeps,
  logger: BackfillLogger = { warn: () => undefined },
): Promise<BackfillResult> {
  const result: BackfillResult = {
    versionsLinked: 0,
    attachmentsLinked: 0,
    contentsCreated: 0,
    textCopied: 0,
    documentsOptedIn: 0,
    markedUnsupported: 0,
    unreadable: 0,
  };

  /** Same semantics as DocumentContentService.findOrCreate, plus a created flag. */
  async function findOrCreateContent(input: {
    workspaceId: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<ContentRef> {
    const { workspaceId, sha256, mimeType, sizeBytes } = input;
    const key = { workspaceId_sha256: { workspaceId, sha256 } };
    const select = { id: true, status: true, extractedText: true } as const;
    const existing = await prisma.documentContent.findUnique({
      where: key,
      select,
    });
    if (existing) return existing;
    try {
      const created = await prisma.documentContent.upsert({
        where: key,
        update: {},
        create: { workspaceId, sha256, mimeType, sizeBytes },
        select,
      });
      result.contentsCreated += 1;
      return created;
    } catch (error) {
      // A concurrent writer created the same row between our read and write.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return prisma.documentContent.findUniqueOrThrow({
          where: key,
          select,
        });
      }
      throw error;
    }
  }

  /** Moves legacy extraction results onto the content row, never overwriting. */
  async function carryLegacyExtraction(
    content: ContentRef,
    legacy: LegacyExtraction,
  ): Promise<void> {
    if (
      legacy.extractionStatus === "COMPLETED" &&
      legacy.extractedText !== null &&
      content.extractedText === null
    ) {
      await prisma.documentContent.update({
        where: { id: content.id },
        data: {
          extractedText: legacy.extractedText,
          sourceScript: legacy.sourceScript,
        },
      });
      content.extractedText = legacy.extractedText;
      result.textCopied += 1;
    } else if (
      legacy.extractionStatus === "UNSUPPORTED" &&
      content.status === "PENDING" &&
      content.extractedText === null
    ) {
      await prisma.documentContent.update({
        where: { id: content.id },
        data: { status: "UNSUPPORTED", error: legacy.extractionError },
      });
      content.status = "UNSUPPORTED";
      result.markedUnsupported += 1;
    }
  }

  // Document versions.
  let cursor = "";
  for (;;) {
    const versions = await prisma.documentVersion.findMany({
      where: { contentId: null, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        workspaceId: true,
        storedFileId: true,
        extractionStatus: true,
        extractedText: true,
        sourceScript: true,
        extractionError: true,
        storedFile: {
          select: { sha256: true, sizeBytes: true, detectedMimeType: true },
        },
      },
    });
    if (versions.length === 0) break;
    cursor = versions[versions.length - 1].id;

    for (const version of versions) {
      let sha256 = version.storedFile.sha256;
      let sizeBytes = Number(version.storedFile.sizeBytes);
      if (!sha256) {
        try {
          const bytes = await deps.readStoredFile(
            version.workspaceId,
            version.storedFileId,
          );
          sha256 = sha256Hex(bytes);
          sizeBytes = bytes.length;
        } catch (error) {
          logger.warn(
            `Version ${version.id}: stored file unreadable (${describe(error)})`,
          );
          result.unreadable += 1;
          continue;
        }
      }
      const content = await findOrCreateContent({
        workspaceId: version.workspaceId,
        sha256,
        mimeType: version.storedFile.detectedMimeType ?? DEFAULT_MIME,
        sizeBytes,
      });
      // Carry the legacy text before linking: a crash in between leaves the
      // row unlinked, so the next run retries it.
      await carryLegacyExtraction(content, version);
      await prisma.documentVersion.update({
        where: { id: version.id },
        data: { contentId: content.id },
      });
      result.versionsLinked += 1;
    }
  }

  // Chat attachments.
  cursor = "";
  for (;;) {
    const attachments = await prisma.chatAttachment.findMany({
      where: { contentId: null, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        workspaceId: true,
        sessionId: true,
        storedName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        extractionStatus: true,
        extractedText: true,
        sourceScript: true,
        extractionError: true,
      },
    });
    if (attachments.length === 0) break;
    cursor = attachments[attachments.length - 1].id;

    for (const attachment of attachments) {
      let sha256 = attachment.sha256;
      if (!sha256) {
        try {
          sha256 = sha256Hex(await deps.readChatAttachment(attachment));
        } catch (error) {
          logger.warn(
            `Attachment ${attachment.id}: file unreadable (${describe(error)})`,
          );
          result.unreadable += 1;
          continue;
        }
      }
      const content = await findOrCreateContent({
        workspaceId: attachment.workspaceId,
        sha256,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      });
      await carryLegacyExtraction(content, attachment);
      await prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: attachment.sha256
          ? { contentId: content.id }
          : { contentId: content.id, sha256 },
      });
      result.attachmentsLinked += 1;
    }
  }

  // Documents promoted from chat attachments were already readable by the
  // assistant, so they keep that access. A system change: no acting user.
  // Only documents nobody ever toggled (aiAccessChangedAt null) qualify, so a
  // user's explicit "off" is never reverted and re-runs settle at zero.
  const promoted = await prisma.chatAttachment.findMany({
    where: { documentId: { not: null } },
    select: { workspaceId: true, documentId: true },
  });
  const idsByWorkspace = new Map<string, string[]>();
  for (const row of promoted) {
    const ids = idsByWorkspace.get(row.workspaceId) ?? [];
    ids.push(row.documentId as string);
    idsByWorkspace.set(row.workspaceId, ids);
  }
  const now = new Date();
  for (const [workspaceId, ids] of idsByWorkspace) {
    const updated = await prisma.document.updateMany({
      where: {
        id: { in: ids },
        workspaceId,
        aiAccess: false,
        aiAccessChangedAt: null,
      },
      data: { aiAccess: true, aiAccessChangedAt: now },
    });
    result.documentsOptedIn += updated.count;
  }

  return result;
}
