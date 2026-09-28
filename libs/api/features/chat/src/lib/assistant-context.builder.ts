import { Injectable, Optional } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import { toLatin } from "@law/transliteration";
import { AssistantDraftingService } from "./assistant-drafting.service";
import { ChatRuntimeConfig } from "./chat.config";
import { MatterLinkService } from "./matter-link.service";

export type AssistantHistoryMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export interface AssistantTurnContext {
  /** Conversation up to and including the triggering user message, oldest first. */
  messages: AssistantHistoryMessage[];
  sessionCaseId: string | null;
  caseContext: string | null;
  /** Drafts of this conversation for the agent (AI_ARCHITECTURE.md §3). */
  workspaceState: string | null;
  /** Rolling summary of turns before the verbatim history (phase 6). */
  conversationSummary: string | null;
  /** The conversation's owner: "me" for the assistant's office tools. */
  currentUser: { id: string; displayName: string } | null;
}

const MESSAGE_MAX_CHARS = 8_000;
const TRIAGE_HISTORY_MESSAGES = 6;

/**
 * Read-only: rebuilds what the assistant agent sees for one turn from our
 * tables (AI_ARCHITECTURE.md §3, §6). Text is converted to Latin script.
 */
@Injectable()
export class AssistantContextBuilder {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly config: ChatRuntimeConfig,
    private readonly matterLink: MatterLinkService,
    @Optional() private readonly drafting?: AssistantDraftingService,
  ) {}

  async build(input: {
    workspaceId: string;
    sessionId: string;
    messageId?: string;
  }): Promise<AssistantTurnContext> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: input.sessionId, workspaceId: input.workspaceId },
      select: {
        summary: true,
        summaryThroughAt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    const [messages, sessionCaseId, caseContext, workspaceState] =
      await Promise.all([
        // Summarized turns are represented by the summary, not repeated.
        this.conversation(
          input.sessionId,
          input.messageId,
          session?.summaryThroughAt ?? undefined,
        ),
        this.matterLink.sessionCaseId(input.workspaceId, input.sessionId),
        this.matterLink.caseContextBlock(input.workspaceId, input.sessionId),
        this.drafting?.workspaceState(input.workspaceId, input.sessionId) ??
          null,
      ]);
    return {
      messages,
      sessionCaseId,
      caseContext: caseContext ? toLatin(caseContext) : null,
      workspaceState,
      conversationSummary: session?.summary?.trim()
        ? toLatin(session.summary)
        : null,
      currentUser: session?.createdBy
        ? {
            id: session.createdBy.id,
            displayName: toLatin(
              [session.createdBy.firstName, session.createdBy.lastName]
                .filter(Boolean)
                .join(" ") || session.createdBy.email,
            ),
          }
        : null,
    };
  }

  /** Recent turns before the triggering message, for the Portir guardrail. */
  async triageHistory(
    sessionId: string,
    messageId?: string,
  ): Promise<AssistantHistoryMessage[]> {
    const messages = await this.conversation(sessionId, messageId);
    return messages.slice(0, -1).slice(-TRIAGE_HISTORY_MESSAGES);
  }

  private async conversation(
    sessionId: string,
    messageId?: string,
    afterAt?: Date,
  ): Promise<AssistantHistoryMessage[]> {
    const trigger = messageId
      ? await this.prisma.chatMessage.findFirst({
          where: { id: messageId, sessionId },
          select: { createdAt: true },
        })
      : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        status: "COMPLETED",
        role: { in: ["USER", "ASSISTANT"] },
        ...(trigger || afterAt
          ? {
              createdAt: {
                ...(trigger ? { lte: trigger.createdAt } : {}),
                ...(afterAt ? { gt: afterAt } : {}),
              },
            }
          : {}),
      },
      include: { attachments: { select: { originalName: true } } },
      orderBy: { createdAt: "desc" },
      take: this.config.assistantHistoryMaxMessages,
    });

    const messages = rows
      .reverse()
      .map((row) => toHistoryMessage(row))
      .filter((message): message is AssistantHistoryMessage => !!message);
    return fitBudget(messages, this.config.assistantHistoryMaxChars);
  }
}

export function toHistoryMessage(row: {
  role: string;
  content: string;
  attachments?: Array<{ originalName: string }>;
}): AssistantHistoryMessage | null {
  const role: AssistantHistoryMessage["role"] =
    row.role === "USER" ? "user" : "assistant";
  const rawText = row.content === "(attachment)" ? "" : row.content;
  let text = toLatin(rawText).trim();
  if (text.length > MESSAGE_MAX_CHARS) {
    text = `${text.slice(0, MESSAGE_MAX_CHARS)}…`;
  }
  const attachmentNames = (row.attachments ?? []).map(
    (attachment) => attachment.originalName,
  );
  if (attachmentNames.length) {
    text = [
      text,
      `[Prilozi: ${attachmentNames.join(", ")} — tekst: search_documents / read_document]`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return text ? ({ role, content: text } as AssistantHistoryMessage) : null;
}

/** Drops the oldest messages first; the triggering message is always kept. */
function fitBudget(
  messages: AssistantHistoryMessage[],
  maxChars: number,
): AssistantHistoryMessage[] {
  const kept: AssistantHistoryMessage[] = [];
  let total = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (kept.length && total + message.content.length > maxChars) break;
    kept.unshift(message);
    total += message.content.length;
  }
  // Providers expect the conversation to start with a user turn.
  while (kept.length > 1 && kept[0].role === "assistant") kept.shift();
  return kept;
}
