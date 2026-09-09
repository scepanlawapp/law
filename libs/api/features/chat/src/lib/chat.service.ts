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
  ChatMessageResponse,
  ChatSessionListResponse,
  ChatSendMessageResponse,
  ChatSessionDetail,
  ChatSessionSummary,
  ChatStreamEvent,
  DocumentScript,
  DraftResultResponse,
  WorkflowJobResponse,
} from "@law/api-interfaces";
import {
  paginationMeta,
  PaginationQueryDto,
  parseSort,
  PrismaService,
} from "@law/core";
import { Prisma } from "@prisma/client";
import { ChatModelProvider, OpenRouterChatModelProvider } from "@law/llm";
import { runPortirGraph } from "@law/triage";
import { extractAttachmentText } from "@law/extraction";
import { toCyrillic, toLatin } from "@law/transliteration";
import {
  BriefDocumentInput,
  BriefResult,
  buildBriefUserPrompt,
  runBriefExtractionLlm,
} from "@law/brief-extraction";
import { buildDraftingUserPrompt, runDraftingLlm } from "@law/drafting";
import { ChatRuntimeConfig, CHAT_ALLOWED_MIME_TYPES } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatStorageService } from "./chat.storage";

export const CHAT_MODEL_PROVIDER = "CHAT_MODEL_PROVIDER";

export interface UploadedChatFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventBus,
    private readonly storage: ChatStorageService,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
  ) {}

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
      items: sessions.map((session) => this.toSessionSummary(session)),
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
    return this.toSessionSummary(session);
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
      ...this.toSessionSummary(session),
      messages: messages.map((message) => this.toMessage(message)),
    };
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

    const mappedUserMessage = this.toMessage({
      ...userMessage,
      attachments: savedAttachments,
    });
    this.emit({
      type: "message.created",
      sessionId: session.id,
      createdAt: mappedUserMessage.createdAt,
      message: mappedUserMessage,
    });

    // Prompts always receive Latin; the stored message keeps the user's script.
    void this.runTriage({
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
    const response = this.toDraft(draft);
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
      message: this.toMessage(message),
    }));
    for (const job of jobs) {
      events.push({
        type: "job.queued",
        sessionId,
        createdAt: job.createdAt.toISOString(),
        job: this.toJob(job),
      });
    }
    return events.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private async runTriage(params: {
    workspaceId: string;
    sessionId: string;
    userId: string;
    correlationId: string;
    content: string;
    attachments: ChatAttachmentSummary[];
  }): Promise<void> {
    this.emit({
      type: "triage.started",
      sessionId: params.sessionId,
      createdAt: new Date().toISOString(),
    });

    const provider = this.resolveProvider();
    const result = await runPortirGraph(provider, {
      userText: params.content,
      attachments: params.attachments,
    });

    this.emit({
      type: "triage.completed",
      sessionId: params.sessionId,
      createdAt: new Date().toISOString(),
      decision: result.decision.decision,
      reason: result.decision.reason,
    });

    const assistant = await this.prisma.chatMessage.create({
      data: {
        sessionId: params.sessionId,
        role: "ASSISTANT",
        content: result.assistantContent,
        status: "COMPLETED",
        triageDecision: result.decision.decision,
        correlationId: params.correlationId,
        metadata: { reason: result.decision.reason },
      },
    });
    const mapped = this.toMessage({ ...assistant, attachments: [] });
    this.emit({
      type: "message.created",
      sessionId: params.sessionId,
      createdAt: mapped.createdAt,
      message: mapped,
    });

    if (!result.queueBriefExtraction) return;

    const job = await this.prisma.workflowJob.create({
      data: {
        workspaceId: params.workspaceId,
        sessionId: params.sessionId,
        workflowName: "brief-extraction",
        status: "QUEUED",
        correlationId: params.correlationId,
        input: JSON.parse(
          JSON.stringify({
            actorId: params.userId,
            messageId: mapped.id,
            userText: params.content,
            attachments: params.attachments,
          }),
        ),
      },
    });
    this.emit({
      type: "job.queued",
      sessionId: params.sessionId,
      createdAt: job.createdAt.toISOString(),
      job: this.toJob(job),
    });

    await this.runBriefExtraction({
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      jobId: job.id,
      messageId: mapped.id,
      userText: params.content,
      attachmentIds: params.attachments.map((attachment) => attachment.id),
    });
  }

  private async runBriefExtraction(params: {
    workspaceId: string;
    sessionId: string;
    jobId: string;
    messageId: string;
    userText: string;
    attachmentIds: string[];
  }): Promise<void> {
    try {
      await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: { status: "RUNNING" },
      });

      const attachments = params.attachmentIds.length
        ? await this.prisma.chatAttachment.findMany({
            where: { id: { in: params.attachmentIds } },
          })
        : [];

      const extractedAttachments = [];
      const briefDocuments: BriefDocumentInput[] = [];
      for (const attachment of attachments) {
        const result = await this.extractAttachment(attachment);
        extractedAttachments.push({
          attachmentId: attachment.id,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          status: result.status,
          text: this.truncateForJobOutput(result.text),
        });
        briefDocuments.push({
          id: attachment.id,
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          status: result.status,
          text: result.text,
        });
      }

      const hasUserText =
        params.userText.trim().length > 0 && params.userText !== "(attachment)";
      const hasContext =
        hasUserText ||
        briefDocuments.some((doc) => doc.status === "COMPLETED" && !!doc.text);

      let output: Record<string, unknown> = {
        userText: params.userText,
        attachments: extractedAttachments,
      };
      let errorCode: string | null = null;
      let draftingTrigger: {
        briefResultId: string;
        brief: BriefResult;
      } | null = null;

      if (!hasContext) {
        output = { ...output, brief: null, briefOutcome: "empty" };
      } else {
        try {
          const provider = this.resolveProvider();
          const { prompt, promptChars, truncated } = buildBriefUserPrompt(
            { userText: params.userText, documents: briefDocuments },
            {
              perDocMaxChars: this.config.briefPerDocMaxChars,
              totalMaxChars: this.config.briefTotalMaxChars,
            },
          );
          const brief = await runBriefExtractionLlm(provider, prompt);

          const briefResult = await this.prisma.briefExtractionResult.create({
            data: {
              jobId: params.jobId,
              workspaceId: params.workspaceId,
              sessionId: params.sessionId,
              messageId: params.messageId,
              brief: JSON.parse(JSON.stringify(brief)),
              confidence: brief.confidence,
              missingFields: brief.missingFields,
              promptChars,
              truncated,
              model: this.config.openRouterModel,
            },
          });

          output = { ...output, brief };
          if (brief.jobType === "lawsuit") {
            draftingTrigger = { briefResultId: briefResult.id, brief };
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Brief LLM failed";
          this.logger.error(
            `Brief LLM failed for job ${params.jobId} (session ${params.sessionId}): ${message}`,
          );
          output = { ...output, briefError: message };
          errorCode = "BRIEF_LLM_FAILED";
        }
      }

      const job = await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: {
          status: "COMPLETED",
          errorCode,
          output: JSON.parse(JSON.stringify(output)),
        },
      });
      this.emit({
        type: "job.updated",
        sessionId: params.sessionId,
        createdAt: job.updatedAt.toISOString(),
        job: this.toJob(job),
      });

      if (draftingTrigger) {
        const draftJob = await this.prisma.workflowJob.create({
          data: {
            workspaceId: params.workspaceId,
            sessionId: params.sessionId,
            workflowName: "drafting",
            status: "QUEUED",
            correlationId: job.correlationId,
            input: JSON.parse(
              JSON.stringify({
                briefResultId: draftingTrigger.briefResultId,
                messageId: params.messageId,
              }),
            ),
          },
        });
        this.emit({
          type: "job.queued",
          sessionId: params.sessionId,
          createdAt: draftJob.createdAt.toISOString(),
          job: this.toJob(draftJob),
        });

        await this.runDrafting({
          workspaceId: params.workspaceId,
          sessionId: params.sessionId,
          jobId: draftJob.id,
          messageId: params.messageId,
          briefResultId: draftingTrigger.briefResultId,
          brief: draftingTrigger.brief,
        });
      }
    } catch (error) {
      const job = await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: { status: "FAILED", errorCode: "EXTRACTION_FAILED" },
      });
      this.logger.error(
        error instanceof Error ? error.message : "Brief extraction failed",
      );
      this.emit({
        type: "job.updated",
        sessionId: params.sessionId,
        createdAt: job.updatedAt.toISOString(),
        job: this.toJob(job),
      });
    }
  }

  private async runDrafting(params: {
    workspaceId: string;
    sessionId: string;
    jobId: string;
    messageId: string;
    briefResultId: string;
    brief: BriefResult;
  }): Promise<void> {
    try {
      await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: { status: "RUNNING" },
      });

      let output: Record<string, unknown> = {};
      let errorCode: string | null = null;

      try {
        const provider = this.resolveProvider();
        const { prompt, promptChars, truncated } = buildDraftingUserPrompt(
          params.brief,
          this.config.draftingPromptMaxChars,
        );
        const draft = await runDraftingLlm(provider, prompt);

        await this.prisma.draftResult.create({
          data: {
            jobId: params.jobId,
            workspaceId: params.workspaceId,
            sessionId: params.sessionId,
            messageId: params.messageId,
            briefResultId: params.briefResultId,
            documentText: draft.documentText,
            warnings: draft.warnings,
            promptChars,
            truncated,
            model: this.config.openRouterModel,
          },
        });

        output = {
          draft: {
            documentTextLength: draft.documentText.length,
            warnings: draft.warnings,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Drafting LLM failed";
        this.logger.error(
          `Drafting LLM failed for job ${params.jobId} (session ${params.sessionId}): ${message}`,
        );
        output = { draftError: message };
        errorCode = "DRAFTING_LLM_FAILED";
      }

      const job = await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: {
          status: "COMPLETED",
          errorCode,
          output: JSON.parse(JSON.stringify(output)),
        },
      });
      this.emit({
        type: "job.updated",
        sessionId: params.sessionId,
        createdAt: job.updatedAt.toISOString(),
        job: this.toJob(job),
      });
    } catch (error) {
      const job = await this.prisma.workflowJob.update({
        where: { id: params.jobId },
        data: { status: "FAILED", errorCode: "DRAFTING_FAILED" },
      });
      this.logger.error(
        error instanceof Error ? error.message : "Drafting failed",
      );
      this.emit({
        type: "job.updated",
        sessionId: params.sessionId,
        createdAt: job.updatedAt.toISOString(),
        job: this.toJob(job),
      });
    }
  }

  private async extractAttachment(attachment: {
    id: string;
    workspaceId: string;
    sessionId: string;
    storedName: string;
    mimeType: string;
  }): Promise<{
    status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
    text?: string;
  }> {
    try {
      const buffer = await this.storage.read({
        workspaceId: attachment.workspaceId,
        sessionId: attachment.sessionId,
        storedName: attachment.storedName,
      });
      const result = await extractAttachmentText({
        mimeType: attachment.mimeType,
        buffer,
      });
      await this.prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: result.status,
          extractedText: result.text ?? null,
          sourceScript: result.sourceScript ?? null,
          extractionError: result.error ?? null,
          extractedAt: new Date(),
        },
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Extraction failed";
      await this.prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: "FAILED",
          extractionError: message,
          extractedAt: new Date(),
        },
      });
      return { status: "FAILED", text: undefined };
    }
  }

  private truncateForJobOutput(text: string | undefined): string | undefined {
    if (!text) return text;
    const max = this.config.extractionTextMaxChars;
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  private resolveProvider(): ChatModelProvider {
    if (this.provider) return this.provider;
    if (!this.config.openRouterApiKey) {
      throw new BadRequestException(
        "OPENROUTER_API_KEY is not configured for Portir",
      );
    }
    return new OpenRouterChatModelProvider({
      apiKey: this.config.openRouterApiKey,
      baseUrl: this.config.openRouterBaseUrl,
      model: this.config.openRouterModel,
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
      where: { id: sessionId, workspaceId },
    });
    if (!session) throw new NotFoundException("Chat session not found");
    return session;
  }

  private emit(event: ChatStreamEvent): void {
    this.events.emit(event);
  }

  private toSessionSummary(session: {
    id: string;
    workspaceId: string;
    createdByUserId: string;
    title: string | null;
    status: "ACTIVE" | "ARCHIVED";
    createdAt: Date;
    updatedAt: Date;
  }): ChatSessionSummary {
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      createdByUserId: session.createdByUserId,
      title: session.title,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toMessage(message: {
    id: string;
    sessionId: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    content: string;
    status: "PENDING" | "COMPLETED" | "FAILED";
    triageDecision?: "LEGAL" | "NON_LEGAL" | "UNCLEAR" | null;
    correlationId?: string | null;
    createdAt: Date;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
    }>;
  }): ChatMessageResponse {
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      status: message.status,
      triageDecision: message.triageDecision,
      correlationId: message.correlationId,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) =>
        this.toAttachment(attachment),
      ),
    };
  }

  private toAttachment(attachment: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    extractionStatus?: ChatAttachmentSummary["extractionStatus"];
    sourceScript?: ChatAttachmentSummary["sourceScript"];
  }): ChatAttachmentSummary {
    return {
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt.toISOString(),
      extractionStatus: attachment.extractionStatus,
      sourceScript: attachment.sourceScript ?? null,
    };
  }

  private toJob(job: {
    id: string;
    workspaceId: string;
    sessionId: string;
    workflowName: string;
    status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
    correlationId: string;
    createdAt: Date;
  }): WorkflowJobResponse {
    return {
      id: job.id,
      workspaceId: job.workspaceId,
      sessionId: job.sessionId,
      workflowName: job.workflowName,
      status: job.status,
      correlationId: job.correlationId,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private toDraft(draft: {
    id: string;
    jobId: string;
    workspaceId: string;
    sessionId: string;
    messageId: string | null;
    briefResultId: string | null;
    documentText: string;
    warnings: string[];
    promptChars: number;
    truncated: boolean;
    model: string;
    errorCode: string | null;
    createdAt: Date;
  }): DraftResultResponse {
    return {
      id: draft.id,
      jobId: draft.jobId,
      workspaceId: draft.workspaceId,
      sessionId: draft.sessionId,
      messageId: draft.messageId,
      briefResultId: draft.briefResultId,
      documentText: draft.documentText,
      warnings: draft.warnings,
      promptChars: draft.promptChars,
      truncated: draft.truncated,
      model: draft.model,
      errorCode: draft.errorCode,
      createdAt: draft.createdAt.toISOString(),
    };
  }
}
