import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import type { ChatModelProvider } from "@law/llm";
import { summarizeConversation } from "@law/mastra";
import {
  toHistoryMessage,
  type AssistantHistoryMessage,
} from "./assistant-context.builder";
import { ChatRuntimeConfig } from "./chat.config";
import { resolveChatModelProvider } from "./chat-model.util";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";

const UNSUMMARIZED_SCAN_LIMIT = 200;

/**
 * Keeps a rolling per-session summary of turns that have left the agent's
 * verbatim history window (AI_ARCHITECTURE.md §3). Stored on ChatSession,
 * next to the messages; never in Mastra memory (§6).
 */
@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
  ) {}

  /**
   * Best-effort: folds the oldest unsummarized turns into the summary when
   * they no longer fit the window. Returns whether the summary changed.
   */
  async refresh(workspaceId: string, sessionId: string): Promise<boolean> {
    try {
      return await this.refreshOrThrow(workspaceId, sessionId);
    } catch (error) {
      this.logger.warn(
        `Conversation summary failed for session ${sessionId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return false;
    }
  }

  private async refreshOrThrow(
    workspaceId: string,
    sessionId: string,
  ): Promise<boolean> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, workspaceId, isDeleted: false },
      select: { summary: true, summaryThroughAt: true },
    });
    if (!session) return false;

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        status: "COMPLETED",
        role: { in: ["USER", "ASSISTANT"] },
        ...(session.summaryThroughAt
          ? { createdAt: { gt: session.summaryThroughAt } }
          : {}),
      },
      include: { attachments: { select: { originalName: true } } },
      orderBy: { createdAt: "asc" },
      take: UNSUMMARIZED_SCAN_LIMIT,
    });
    const entries = rows
      .map((row) => ({ row, message: toHistoryMessage(row) }))
      .filter(
        (
          entry,
        ): entry is {
          row: (typeof rows)[number];
          message: AssistantHistoryMessage;
        } => !!entry.message,
      );
    const chars = (items: typeof entries) =>
      items.reduce((sum, entry) => sum + entry.message.content.length, 0);

    const overCount =
      entries.length > this.config.assistantSummaryTriggerMessages;
    const overChars =
      chars(entries) > this.config.assistantHistoryMaxChars * 0.8;
    if (!overCount && !overChars) return false;

    // Keep the most recent turns verbatim; fold the rest (and more, if the
    // kept part alone would still overflow the character budget).
    let keepFrom = Math.max(
      0,
      entries.length - this.config.assistantSummaryKeepRecent,
    );
    while (
      keepFrom < entries.length - 1 &&
      chars(entries.slice(keepFrom)) >
        this.config.assistantHistoryMaxChars * 0.6
    ) {
      keepFrom += 1;
    }
    const fold = entries.slice(0, keepFrom);
    if (!fold.length) return false;

    const summary = await summarizeConversation(
      resolveChatModelProvider(this.config, this.provider),
      {
        previousSummary: session.summary,
        messages: fold.map((entry) => entry.message),
      },
    );
    // Optimistic: only advance from the cursor we summarized from.
    const updated = await this.prisma.chatSession.updateMany({
      where: {
        id: sessionId,
        workspaceId,
        summaryThroughAt: session.summaryThroughAt,
      },
      data: {
        summary,
        summaryThroughAt: fold[fold.length - 1].row.createdAt,
        summaryUpdatedAt: new Date(),
        summaryModel: this.config.openRouterModel,
      },
    });
    return updated.count > 0;
  }
}
