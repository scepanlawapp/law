import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { DocumentsService } from "@law/workspace-documents";
import { ChatAttachmentStorage } from "@law/file-storage";
import { DocumentContentService } from "@law/document-ingestion";

/**
 * Turns a case-linked chat's attachments into workspace documents linked to
 * the case and its client, so they show up on the case and the assistant can
 * read them later. Idempotent (`ChatAttachment.documentId` plus a stable
 * idempotency key) and best effort: failures are logged, never thrown, and
 * retried on the next link or upload.
 */
@Injectable()
export class ChatDocumentPromotionService {
  private readonly logger = new Logger(ChatDocumentPromotionService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: ChatAttachmentStorage,
    private readonly content: DocumentContentService,
    @Optional() private readonly documents?: DocumentsService,
  ) {}

  /** Returns how many attachments were promoted. */
  async promoteSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<number> {
    if (
      !this.documents ||
      WorkspaceContextService.current?.workspaceId !== workspaceId
    ) {
      return 0;
    }
    try {
      const session = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, workspaceId, caseId: { not: null } },
        select: { case: { select: { id: true, clientId: true } } },
      });
      if (!session?.case) return 0;
      const attachments = await this.prisma.chatAttachment.findMany({
        where: { workspaceId, sessionId, documentId: null },
        orderBy: { createdAt: "asc" },
      });
      let promoted = 0;
      for (const attachment of attachments) {
        if (await this.promote(attachment, session.case)) promoted += 1;
      }
      return promoted;
    } catch (error) {
      this.logger.warn(
        `Promotion failed for session ${sessionId}: ${message(error)}`,
      );
      return 0;
    }
  }

  private async promote(
    attachment: {
      id: string;
      workspaceId: string;
      sessionId: string;
      originalName: string;
      storedName: string;
      mimeType: string;
      sizeBytes: number;
      contentId: string | null;
    },
    matter: { id: string; clientId: string },
  ): Promise<boolean> {
    try {
      const buffer = await this.storage.read({
        workspaceId: attachment.workspaceId,
        sessionId: attachment.sessionId,
        storedName: attachment.storedName,
      });
      // Attachments uploaded before content rows existed are hashed here from
      // the bytes already read, so they share content like new uploads do.
      const contentId =
        attachment.contentId ?? (await this.linkContent(attachment, buffer));
      const document = await this.documents!.create({
        title: documentTitle(attachment.originalName),
        caseIds: [matter.id],
        clientIds: [matter.clientId],
        originalFilename: attachment.originalName,
        stream: Readable.from(buffer),
        idempotencyKey: `chat-attachment:${attachment.id}`,
        contentId,
        aiAccess: true,
        source: "CHAT_ATTACHMENT",
      });
      await this.prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: { documentId: document.id },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Attachment ${attachment.id} was not promoted: ${message(error)}`,
      );
      return false;
    }
  }

  private async linkContent(
    attachment: {
      id: string;
      workspaceId: string;
      mimeType: string;
      sizeBytes: number;
    },
    buffer: Buffer,
  ): Promise<string> {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const content = await this.content.findOrCreate({
      workspaceId: attachment.workspaceId,
      sha256,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    });
    await this.prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: { sha256, contentId: content.id },
    });
    return content.id;
  }
}

function documentTitle(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^./\\]{1,8}$/, "").trim();
  return (withoutExtension || originalName).slice(0, 320);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
