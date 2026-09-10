import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ChatAttachmentSummary,
  ChatSessionListResponse,
  ChatSendMessageResponse,
  ChatSessionDetail,
  ChatSessionSummary,
  ChatStreamEvent,
  DocumentScript,
  DraftResultResponse,
} from "@law/api-interfaces";
import {
  paginationMeta,
  PaginationQueryDto,
  parseSort,
  PrismaService,
} from "@law/core";
import { Prisma } from "@prisma/client";
import { ChatModelProvider } from "@law/llm";
import { toCyrillic, toLatin } from "@law/transliteration";
import { buildTitleUserPrompt, generateTitle } from "@law/title-generation";
import { ChatRuntimeConfig, CHAT_ALLOWED_MIME_TYPES } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatStorageService } from "./chat.storage";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";
import { resolveChatModelProvider } from "./chat-model.util";
import {
  toDraft,
  toJob,
  toMessage,
  toSessionSummary,
} from "./chat.mappers";
import { createInlineWorkflowQueue } from "./workflow.runner";
import {
  WORKFLOW_QUEUE_PORT,
  WorkflowQueuePort,
} from "./workflow-queue.types";

export { CHAT_MODEL_PROVIDER };

export interface UploadedChatFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly workflowQueue: WorkflowQueuePort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventBus,
    private readonly storage: ChatStorageService,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
    @Optional()
    @Inject(WORKFLOW_QUEUE_PORT)
    workflowQueue?: WorkflowQueuePort,
  ) {
    this.workflowQueue =
      workflowQueue ??
      createInlineWorkflowQueue(prisma, events, storage, config, provider);
  }

  async listSessions(
    workspaceId: string,
    query: PaginationQueryDto,
  ): Promise<ChatSessionListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = parseSort(
      query.sort,
      ["title", "createdAt", "updatedAt", "status"],
      [{ field: "updatedAt", direction: "desc" }],
    );
    const where: Prisma.ChatSessionWhereInput = {
      workspaceId,
      status: "ACTIVE",
      isDeleted: false,
      ...(query.search?.trim()
        ? { title: { contains: query.search.trim(), mode: "insensitive" } }
        : {}),
      ...(query.from || query.to
        ? {
            updatedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.ChatSessionOrderByWithRelationInput[] = [
      ...sort.map((item) => ({ [item.field]: item.direction })),
      { id: "asc" },
    ];
    const [sessions, totalItems] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.chatSession.count({ where }),
    ]);
    return {
      items: sessions.map((session) => toSessionSummary(session)),
      meta: paginationMeta(page, pageSize, totalItems, sort),
    };
  }

  async createSession(
    workspaceId: string,
    userId: string,
    title?: string,
  ): Promise<ChatSessionSummary> {
    const session = await this.prisma.chatSession.create({
      data: {
        workspaceId,
        createdByUserId: userId,
        title: title?.trim() || "New chat",
      },
    });
    return toSessionSummary(session);
  }

  async updateSession(
    workspaceId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionSummary> {
    const session = await this.requireSession(workspaceId, sessionId);
    const updated = await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { title: title.trim() || "New chat" },
    });
    this.emit({
      type: "session.title.updated",
      sessionId: session.id,
      createdAt: updated.updatedAt.toISOString(),
      title: updated.title,
    });
    return toSessionSummary(updated);
  }

  async getSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<ChatSessionDetail> {
    const session = await this.requireSession(workspaceId, sessionId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      ...toSessionSummary(session),
      messages: messages.map((message) => toMessage(message)),
    };
  }

  async deleteSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<ChatSessionSummary> {
    const session = await this.requireSession(workspaceId, sessionId);
    const updated = await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { isDeleted: true },
    });
    this.emit({
      type: "session.deleted",
      sessionId: session.id,
      createdAt: updated.updatedAt.toISOString(),
    });
    return toSessionSummary(updated);
  }

  async sendMessage(params: {
    workspaceId: string;
    sessionId: string;
    userId: string;
    content: string;
    files: UploadedChatFile[];
  }): Promise<ChatSendMessageResponse> {
    const session = await this.requireSession(
      params.workspaceId,
      params.sessionId,
    );
    this.validateFiles(params.files);
    const content = params.content.trim();
    if (!content && params.files.length === 0) {
      throw new BadRequestException(
        "Message text or an attachment is required",
      );
    }

    const correlationId = randomUUID();
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: content || "(attachment)",
        status: "COMPLETED",
        correlationId,
      },
    });

    const savedAttachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
      extractionStatus?: ChatAttachmentSummary["extractionStatus"];
    }> = [];
    for (const file of params.files) {
      const attachmentId = randomUUID();
      const storedName = await this.storage.save({
        workspaceId: params.workspaceId,
        sessionId: session.id,
        attachmentId,
        buffer: file.buffer,
      });
      const saved = await this.prisma.chatAttachment.create({
        data: {
          id: attachmentId,
          workspaceId: params.workspaceId,
          sessionId: session.id,
          messageId: userMessage.id,
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
      savedAttachments.push(saved);
    }

    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    const mappedUserMessage = toMessage({
      ...userMessage,
      attachments: savedAttachments,
    });
    this.emit({
      type: "message.created",
      sessionId: session.id,
      createdAt: mappedUserMessage.createdAt,
      message: mappedUserMessage,
    });

    if (session.title === "New chat") {
      void this.runTitleGeneration({
        sessionId: session.id,
        content: toLatin(mappedUserMessage.content),
        attachmentIds: mappedUserMessage.attachments.map(
          (attachment) => attachment.id,
        ),
      }).catch((error: unknown) => {
        this.logger.error(
          error instanceof Error
            ? error.message
            : "Title generation failed",
        );
      });
    }

    // Prompts always receive Latin; the stored message keeps the user's script.
    void this.enqueueTriage({
      workspaceId: params.workspaceId,
      sessionId: session.id,
      userId: params.userId,
      correlationId,
      content: toLatin(mappedUserMessage.content),
      attachments: mappedUserMessage.attachments,
    }).catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Portir failed",
      );
      this.emit({
        type: "error",
        sessionId: session.id,
        createdAt: new Date().toISOString(),
        error: "Portir could not classify this message.",
      });
    });

    return { userMessage: mappedUserMessage, correlationId };
  }

  private async enqueueTriage(params: {
    workspaceId: string;
    sessionId: string;
    userId: string;
    correlationId: string;
    content: string;
    attachments: ChatAttachmentSummary[];
  }): Promise<void> {
    const job = await this.prisma.workflowJob.create({
      data: {
        workspaceId: params.workspaceId,
        sessionId: params.sessionId,
        workflowName: "triage",
        status: "QUEUED",
        correlationId: params.correlationId,
        input: JSON.parse(
          JSON.stringify({
            actorId: params.userId,
            content: params.content,
            attachments: params.attachments,
          }),
        ),
      },
    });
    this.emit({
      type: "job.queued",
      sessionId: params.sessionId,
      createdAt: job.createdAt.toISOString(),
      job: toJob(job),
    });

    await this.workflowQueue.enqueue("triage", job.id, {
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      jobId: job.id,
      correlationId: params.correlationId,
    });
  }

  async getAttachment(workspaceId: string, attachmentId: string) {
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: { id: attachmentId, workspaceId },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const buffer = await this.storage.read({
      workspaceId,
      sessionId: attachment.sessionId,
      storedName: attachment.storedName,
    });
    return { attachment, buffer };
  }

  async getDraft(
    workspaceId: string,
    jobId: string,
    script: DocumentScript = "latin",
  ): Promise<DraftResultResponse> {
    const draft = await this.prisma.draftResult.findFirst({
      where: { jobId, workspaceId },
    });
    if (!draft) throw new NotFoundException("Draft not found");
    const response = toDraft(draft);
    if (script === "cyrillic") {
      response.documentText = toCyrillic(response.documentText);
    }
    return { ...response, script };
  }

  stream(sessionId: string) {
    return this.events.stream(sessionId);
  }

  async replayEvents(
    workspaceId: string,
    sessionId: string,
    after?: string,
  ): Promise<ChatStreamEvent[]> {
    await this.requireSession(workspaceId, sessionId);
    const afterDate = after ? new Date(after) : new Date(0);
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId, createdAt: { gt: afterDate } },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });
    const jobs = await this.prisma.workflowJob.findMany({
      where: { sessionId, createdAt: { gt: afterDate } },
      orderBy: { createdAt: "asc" },
    });

    const events: ChatStreamEvent[] = messages.map((message) => ({
      type: "message.created" as const,
      sessionId,
      createdAt: message.createdAt.toISOString(),
      message: toMessage(message),
    }));
    for (const job of jobs) {
      events.push({
        type: "job.queued",
        sessionId,
        createdAt: job.createdAt.toISOString(),
        job: toJob(job),
      });
    }
    return events.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private async runTitleGeneration(params: {
    sessionId: string;
    content: string;
    attachmentIds: string[];
  }): Promise<void> {
    const attachments = params.attachmentIds.length
      ? await this.prisma.chatAttachment.findMany({
          where: { id: { in: params.attachmentIds } },
          select: {
            originalName: true,
            mimeType: true,
            extractedText: true,
          },
        })
      : [];

    const { prompt } = buildTitleUserPrompt({
      messageContent: params.content,
      attachments: attachments.map((attachment) => ({
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        text: attachment.extractedText ?? "",
      })),
      perAttachmentMaxChars: this.config.titleContentMaxChars,
    });

    let title: string;
    try {
      const result = await generateTitle(
        resolveChatModelProvider(this.config, this.provider),
        prompt,
      );
      title = result.title;
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : "Title generation LLM failed",
      );
      if (!params.content.trim() || params.content === "(attachment)") {
        return;
      }
      title = params.content.slice(0, 80);
    }

    const updated = await this.prisma.chatSession.update({
      where: { id: params.sessionId },
      data: { title },
    });
    this.emit({
      type: "session.title.updated",
      sessionId: params.sessionId,
      createdAt: updated.updatedAt.toISOString(),
      title: updated.title,
    });
  }

  private validateFiles(files: UploadedChatFile[]): void {
    if (files.length > this.config.maxFilesPerMessage) {
      throw new BadRequestException(
        `At most ${this.config.maxFilesPerMessage} files can be attached`,
      );
    }
    for (const file of files) {
      if (file.size > this.config.uploadMaxBytes) {
        throw new BadRequestException("Attachment exceeds the size limit");
      }
      if (
        !CHAT_ALLOWED_MIME_TYPES.includes(
          file.mimetype as (typeof CHAT_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}`,
        );
      }
    }
  }

  private async requireSession(workspaceId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, workspaceId, isDeleted: false },
    });
    if (!session) throw new NotFoundException("Chat session not found");
    return session;
  }

  private emit(event: ChatStreamEvent): void {
    this.events.emit(event);
  }
}
