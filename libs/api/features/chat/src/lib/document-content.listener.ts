import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import {
  DocumentContentEvent,
  DocumentContentEvents,
  contentAiStatus,
} from "@law/document-ingestion";
import { Subscription } from "rxjs";
import { ChatEventBus } from "./chat.events";

/**
 * Bridges ingestion status changes to chat SSE: every session holding an
 * attachment on the content gets one `document.content.updated` event.
 */
@Injectable()
export class DocumentContentListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentContentListener.name);
  private subscription?: Subscription;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly contentEvents: DocumentContentEvents,
    private readonly bus: ChatEventBus,
  ) {}

  onModuleInit(): void {
    this.subscription = this.contentEvents.stream$.subscribe((event) => {
      void this.forward(event).catch((error: unknown) => {
        this.logger.warn(
          `Content ${event.contentId} update was not forwarded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  private async forward(event: DocumentContentEvent): Promise<void> {
    const attachments = await this.prisma.chatAttachment.findMany({
      where: {
        workspaceId: event.workspaceId,
        contentId: event.contentId,
        // Attachments filed as an off or archived document stay "OFF".
        OR: [
          { documentId: null },
          { document: { aiAccess: true, archivedAt: null } },
        ],
      },
      select: { id: true, sessionId: true },
      orderBy: { createdAt: "asc" },
    });
    const bySession = new Map<string, string[]>();
    for (const attachment of attachments) {
      const ids = bySession.get(attachment.sessionId) ?? [];
      ids.push(attachment.id);
      bySession.set(attachment.sessionId, ids);
    }
    const status = contentAiStatus({ status: event.status });
    const createdAt = new Date().toISOString();
    for (const [sessionId, attachmentIds] of bySession) {
      this.bus.emit({
        type: "document.content.updated",
        workspaceId: event.workspaceId,
        sessionId,
        createdAt,
        attachmentIds,
        status,
      });
    }
  }
}
