import { Injectable, Logger, Optional } from "@nestjs/common";
import { Readable } from "node:stream";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { DocumentsService } from "@law/workspace-documents";
import { ChatStorageService } from "./chat.storage";

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
    private readonly storage: ChatStorageService,
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
      extractionStatus: string;
      extractedText: string | null;
      sourceScript: "LATIN" | "CYRILLIC" | "MIXED" | "NONE" | null;
    },
    matter: { id: string; clientId: string },
  ): Promise<boolean> {
    try {
      const buffer = await this.storage.read({
        workspaceId: attachment.workspaceId,
        sessionId: attachment.sessionId,
        storedName: attachment.storedName,
      });
      const document = await this.documents!.create({
        title: documentTitle(attachment.originalName),
        caseIds: [matter.id],
        clientIds: [matter.clientId],
        originalFilename: attachment.originalName,
        stream: Readable.from(buffer),
        idempotencyKey: `chat-attachment:${attachment.id}`,
        initialText: initialText(attachment),
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
}

function documentTitle(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^./\\]{1,8}$/, "").trim();
  return (withoutExtension || originalName).slice(0, 320);
}

function initialText(attachment: {
  extractionStatus: string;
  extractedText: string | null;
  sourceScript: "LATIN" | "CYRILLIC" | "MIXED" | "NONE" | null;
}) {
  if (attachment.extractionStatus === "COMPLETED" && attachment.extractedText) {
    return {
      status: "COMPLETED" as const,
      text: attachment.extractedText,
      sourceScript: attachment.sourceScript,
    };
  }
  if (attachment.extractionStatus === "UNSUPPORTED") {
    return { status: "UNSUPPORTED" as const, text: null, sourceScript: null };
  }
  return undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
