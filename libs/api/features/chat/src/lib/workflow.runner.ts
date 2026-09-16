import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  ChatAttachmentSummary,
  ChatStreamEvent,
  WorkflowJobStatus,
  WorkflowProgressStage,
} from "@law/api-interfaces";
import { PlatformPrismaService } from "@law/core";
import { Prisma } from "@prisma/client";
import { WorkflowName } from "@law/contracts";
import { ChatModelProvider } from "@law/llm";
import { runPortirGraph } from "@law/triage";
import { extractAttachmentText } from "@law/extraction";
import {
  BriefDocumentInput,
  BriefResult,
  buildBriefUserPrompt,
  runBriefExtractionLlm,
} from "@law/brief-extraction";
import { buildDraftingUserPrompt, runDraftingLlm } from "@law/drafting";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatStorageService } from "./chat.storage";
import { resolveChatModelProvider } from "./chat-model.util";
import { toDraft, toJob, toMessage } from "./chat.mappers";
import {
  WORKFLOW_QUEUE_PORT,
  WorkflowJobPayload,
  WorkflowQueuePort,
} from "./workflow-queue.types";

interface WorkflowJobRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  correlationId: string;
  input: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface TriageInput {
  actorId: string;
  content: string;
  attachments: ChatAttachmentSummary[];
}

interface BriefExtractionInput {
  actorId: string;
  messageId: string;
  userText: string;
  attachments: ChatAttachmentSummary[];
  language?: "sr" | "en";
}

interface DraftingInput {
  briefResultId: string;
  messageId?: string;
  previousDraftId?: string;
  reviewerNote?: string;
  language?: "sr" | "en";
}

interface AnsweringInput {
  userText: string;
  attachments: ChatAttachmentSummary[];
  language: "sr" | "en";
}

/**
 * Holds the actual workflow logic (triage -> brief-extraction -> drafting).
 * Invoked either by the BullMQ `WorkflowProcessor` or, when no real queue is
 * wired (e.g. unit tests), by an in-process `InlineWorkflowQueue`.
 */
@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly storage: ChatStorageService,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider: ChatModelProvider | undefined,
    @Inject(WORKFLOW_QUEUE_PORT)
    private readonly workflowQueue: WorkflowQueuePort,
  ) {}

  private get db(): PlatformPrismaService {
    return this.prisma;
  }

  async run(name: WorkflowName, payload: WorkflowJobPayload): Promise<void> {
    const record = await this.db.workflowJob.findUnique({
      where: { id: payload.jobId },
    });
    if (!record) {
      this.logger.warn(
        `WorkflowJob ${payload.jobId} not found; skipping ${name}`,
      );
      return;
    }
    if (record.status === "COMPLETED") return;

    await this.transitionJob(record, payload, "RUNNING", {
      progressStage: this.initialStage(name, record),
    });

    switch (name) {
      case "triage":
        return this.runTriage(record as WorkflowJobRecord, payload);
      case "answering":
        return this.runAnswering(record as WorkflowJobRecord, payload);
      case "brief-extraction":
        return this.runBriefExtraction(record as WorkflowJobRecord, payload);
      case "drafting":
        return this.runDrafting(record as WorkflowJobRecord, payload);
      default:
        throw new Error(`Unsupported workflow: ${name}`);
    }
  }

  private async runTriage(
    record: WorkflowJobRecord,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    const input = record.input as TriageInput | null;
    if (!input) {
      await this.markFailed(record.id, payload, "TRIAGE_INPUT_MISSING");
      return;
    }

    this.emit({
      type: "triage.started",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: new Date().toISOString(),
    });

    let result: Awaited<ReturnType<typeof runPortirGraph>>;
    try {
      const provider = resolveChatModelProvider(this.config, this.provider);
      result = await runPortirGraph(provider, {
        userText: input.content,
        attachments: input.attachments,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Portir failed";
      this.logger.error(
        `Triage failed for job ${record.id} (session ${payload.sessionId}): ${message}`,
      );
      await this.markFailed(record.id, payload, "TRIAGE_FAILED");
      this.emit({
        type: "error",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: new Date().toISOString(),
        error: "Portir could not classify this message.",
      });
      return;
    }

    this.emit({
      type: "triage.completed",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: new Date().toISOString(),
      decision: result.decision.decision,
      reason: result.decision.reason,
    });

    if (result.decision.decision !== "LEGAL") {
      await this.createAssistantOutcome(payload, result.assistantContent, {
        reason: result.decision.reason,
        triageDecision: result.decision.decision,
      });
    }

    let nextJobId: string | undefined;
    if (result.queueBriefExtraction) {
      const created = await this.db.workflowJob.create({
        data: {
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          workflowName: "brief-extraction",
          status: "QUEUED",
          correlationId: payload.correlationId,
          input: JSON.parse(
            JSON.stringify({
              actorId: input.actorId,
              messageId: payload.messageId,
              userText: input.content,
              attachments: input.attachments,
              language: result.decision.language,
            }),
          ),
        },
      });
      this.emit({
        type: "job.queued",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: created.createdAt.toISOString(),
        job: toJob(created),
      });
      nextJobId = created.id;
    }

    let answerJobId: string | undefined;
    if (result.queueAnswer) {
      const created = await this.db.workflowJob.create({
        data: {
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          workflowName: "answering",
          status: "QUEUED",
          correlationId: payload.correlationId,
          input: JSON.parse(
            JSON.stringify({
              userText: input.content,
              attachments: input.attachments,
              language: result.decision.language,
            }),
          ),
        },
      });
      this.emit({
        type: "job.queued",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: created.createdAt.toISOString(),
        job: toJob(created),
      });
      answerJobId = created.id;
    }

    await this.transitionJob(record, payload, "COMPLETED", {
      progressStage: "UNDERSTANDING_REQUEST",
      decision: result.decision.decision,
      reason: result.decision.reason,
    });

    if (nextJobId) {
      await this.workflowQueue.enqueue("brief-extraction", nextJobId, {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        jobId: nextJobId,
        correlationId: payload.correlationId,
        messageId: payload.messageId,
      });
    }
    if (answerJobId) {
      await this.workflowQueue.enqueue("answering", answerJobId, {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        jobId: answerJobId,
        correlationId: payload.correlationId,
        messageId: payload.messageId,
      });
    }
  }

  private async runAnswering(
    record: WorkflowJobRecord,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    const input = record.input as AnsweringInput | null;
    if (!input) {
      await this.markFailed(record.id, payload, "ANSWER_INPUT_MISSING");
      return;
    }

    const assistant = await this.db.chatMessage.create({
      data: {
        sessionId: payload.sessionId,
        role: "ASSISTANT",
        content: "",
        status: "PENDING",
        correlationId: payload.correlationId,
        metadata: { outcome: "ANSWER" },
      },
    });
    const pendingMessage = toMessage({ ...assistant, attachments: [] });
    this.emit({
      type: "message.started",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: pendingMessage.createdAt,
      message: pendingMessage,
    });

    let content = "";
    try {
      const provider = resolveChatModelProvider(this.config, this.provider);
      for await (const delta of provider.streamText({
        messages: [
          {
            role: "system",
            content: this.answerSystemPrompt(input.language),
          },
          { role: "user", content: input.userText },
        ],
      })) {
        content += delta;
        await this.db.chatMessage.update({
          where: { id: assistant.id },
          data: { content },
        });
        this.emit({
          type: "message.delta",
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          correlationId: payload.correlationId,
          createdAt: new Date().toISOString(),
          messageId: assistant.id,
          delta,
        });
      }
      const completed = await this.db.chatMessage.update({
        where: { id: assistant.id },
        data: { content, status: "COMPLETED" },
      });
      const mapped = toMessage({ ...completed, attachments: [] });
      this.emit({
        type: "message.updated",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: mapped.createdAt,
        message: mapped,
      });
      await this.transitionJob(record, payload, "COMPLETED", {
        progressStage: "PREPARING_ANSWER",
        messageId: assistant.id,
      });
    } catch (error) {
      await this.db.chatMessage.update({
        where: { id: assistant.id },
        data: { content, status: "FAILED" },
      });
      await this.transitionJob(
        record,
        payload,
        "FAILED",
        { progressStage: "PREPARING_ANSWER", messageId: assistant.id },
        "ANSWERING_FAILED",
      );
      this.emit({
        type: "error",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: new Date().toISOString(),
        error:
          input.language === "en"
            ? "The assistant could not complete the answer."
            : "Asistent nije uspeo da završi odgovor.",
      });
    }
  }

  private answerSystemPrompt(language: "sr" | "en"): string {
    const responseLanguage = language === "en" ? "English" : "Serbian";
    return [
      "You are a legal assistant supporting a Serbian law office.",
      `Reply in ${responseLanguage}.`,
      "Provide general, unverified guidance and clearly recommend checking authoritative sources or a lawyer when precision matters.",
      "Do not invent article numbers, citations, case references, or source links.",
      "Use concise Markdown when it improves readability.",
    ].join(" ");
  }

  private async runBriefExtraction(
    record: WorkflowJobRecord,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    const input = record.input as BriefExtractionInput | null;
    if (!input) {
      await this.markFailed(record.id, payload, "BRIEF_INPUT_MISSING");
      return;
    }

    if (input.attachments.length) {
      await this.transitionJob(record, payload, "RUNNING", {
        progressStage: "READING_ATTACHMENTS",
      });
    }

    const attachmentIds = input.attachments.map((attachment) => attachment.id);
    const attachments = attachmentIds.length
      ? await this.db.chatAttachment.findMany({
          where: { id: { in: attachmentIds } },
        })
      : [];

    const extractedAttachments = [];
    const briefDocuments: BriefDocumentInput[] = [];
    for (const attachment of attachments) {
      const summary = input.attachments.find(
        (item) => item.id === attachment.id,
      );
      const result = await this.extractAttachment(attachment, payload, summary);
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
      input.userText.trim().length > 0 && input.userText !== "(attachment)";
    const hasContext =
      hasUserText ||
      briefDocuments.some((doc) => doc.status === "COMPLETED" && !!doc.text);

    await this.transitionJob(record, payload, "RUNNING", {
      progressStage: "EXTRACTING_FACTS",
    });

    let output: Record<string, unknown> = {
      userText: input.userText,
      attachments: extractedAttachments,
    };
    let errorCode: string | null = null;
    let draftingTrigger: { briefResultId: string } | null = null;

    if (!hasContext) {
      output = { ...output, brief: null, briefOutcome: "empty" };
    } else {
      try {
        const provider = resolveChatModelProvider(this.config, this.provider);
        const { prompt, promptChars, truncated } = buildBriefUserPrompt(
          { userText: input.userText, documents: briefDocuments },
          {
            perDocMaxChars: this.config.briefPerDocMaxChars,
            totalMaxChars: this.config.briefTotalMaxChars,
          },
        );
        const brief = await runBriefExtractionLlm(provider, prompt);

        const briefResult = await this.db.briefExtractionResult.create({
          data: {
            jobId: record.id,
            workspaceId: payload.workspaceId,
            sessionId: payload.sessionId,
            messageId: input.messageId,
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
          draftingTrigger = { briefResultId: briefResult.id };
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Brief LLM failed";
        this.logger.error(
          `Brief LLM failed for job ${record.id} (session ${payload.sessionId}): ${message}`,
        );
        output = { ...output, briefError: message };
        errorCode = "BRIEF_LLM_FAILED";
      }
    }

    const job = await this.transitionJob(
      record,
      payload,
      errorCode ? "FAILED" : "COMPLETED",
      {
        ...output,
        progressStage: "EXTRACTING_FACTS",
      },
      errorCode,
    );

    if (draftingTrigger) {
      const draftJob = await this.db.workflowJob.create({
        data: {
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          workflowName: "drafting",
          status: "QUEUED",
          correlationId: job.correlationId,
          input: JSON.parse(
            JSON.stringify({
              briefResultId: draftingTrigger.briefResultId,
              messageId: input.messageId,
              language: input.language,
            }),
          ),
        },
      });
      this.emit({
        type: "job.queued",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: job.correlationId,
        createdAt: draftJob.createdAt.toISOString(),
        job: toJob(draftJob),
      });

      await this.workflowQueue.enqueue("drafting", draftJob.id, {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        jobId: draftJob.id,
        correlationId: job.correlationId,
        messageId: input.messageId,
      });
    } else if (!errorCode) {
      const content = !hasContext
        ? input.language === "en"
          ? "I could not read enough information to prepare a draft. Please add a description of the matter or attach a readable document."
          : "Nema dovoljno čitljivih podataka za pripremu nacrta. Opišite predmet ili priložite čitljiv dokument."
        : input.language === "en"
          ? "The request was analyzed, but automatic drafting currently supports lawsuit drafts only. Please clarify whether you need a lawsuit draft or continue with a legal question."
          : "Zahtev je analiziran, ali automatska izrada trenutno podržava samo nacrte tužbi. Navedite da li želite nacrt tužbe ili nastavite pravnim pitanjem.";
      await this.createAssistantOutcome(payload, content, {
        outcome: hasContext ? "DRAFT_UNSUPPORTED" : "CONTEXT_REQUIRED",
      });
    }
  }

  private async runDrafting(
    record: WorkflowJobRecord,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    const input = record.input as DraftingInput | null;
    if (!input) {
      await this.markFailed(record.id, payload, "DRAFTING_INPUT_MISSING");
      return;
    }

    const briefResult = await this.db.briefExtractionResult.findUnique({
      where: { id: input.briefResultId },
    });
    if (!briefResult) {
      await this.markFailed(record.id, payload, "DRAFTING_BRIEF_MISSING");
      return;
    }
    const brief = briefResult.brief as BriefResult;

    let output: Record<string, unknown> = {};
    let errorCode: string | null = null;

    try {
      const provider = resolveChatModelProvider(this.config, this.provider);
      const { prompt, promptChars, truncated } = buildDraftingUserPrompt(
        brief,
        this.config.draftingPromptMaxChars,
        input.previousDraftId || input.reviewerNote
          ? {
              previousDraft: input.previousDraftId
                ? ((
                    await this.db.draftResult.findUnique({
                      where: { id: input.previousDraftId },
                    })
                  )?.finalDocumentText ?? undefined)
                : undefined,
              reviewerNote: input.reviewerNote,
            }
          : undefined,
      );
      const draft = await runDraftingLlm(provider, prompt);

      await this.transitionJob(record, payload, "RUNNING", {
        progressStage: "SAVING_FOR_REVIEW",
      });
      const persistedDraft = await this.db.draftResult.create({
        data: {
          jobId: record.id,
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          messageId: input.messageId ?? null,
          briefResultId: input.briefResultId,
          documentText: draft.documentText,
          warnings: draft.warnings,
          promptChars,
          truncated,
          model: this.config.openRouterModel,
          previousDraftId: input.previousDraftId ?? null,
        },
      });
      const mappedDraft = toDraft(persistedDraft);
      this.emit({
        type: "draft.updated",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: mappedDraft.updatedAt ?? mappedDraft.createdAt,
        draft: mappedDraft,
      });

      const assistant = await this.db.chatMessage.create({
        data: {
          sessionId: payload.sessionId,
          role: "ASSISTANT",
          content:
            input.language === "en"
              ? "The draft is ready for review."
              : "Nacrt je spreman za pregled.",
          status: "COMPLETED",
          correlationId: payload.correlationId,
          metadata: {
            outcome: "DRAFT_READY",
            draftId: mappedDraft.id,
          },
        },
      });
      const mappedMessage = toMessage({ ...assistant, attachments: [] });
      this.emit({
        type: "message.created",
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        correlationId: payload.correlationId,
        createdAt: mappedMessage.createdAt,
        message: mappedMessage,
      });

      output = {
        progressStage: "SAVING_FOR_REVIEW",
        draft: {
          id: mappedDraft.id,
          documentTextLength: draft.documentText.length,
          warnings: draft.warnings,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Drafting LLM failed";
      this.logger.error(
        `Drafting LLM failed for job ${record.id} (session ${payload.sessionId}): ${message}`,
      );
      output = { draftError: message };
      errorCode = "DRAFTING_LLM_FAILED";
    }

    await this.transitionJob(
      record,
      payload,
      errorCode ? "FAILED" : "COMPLETED",
      {
        ...output,
        progressStage:
          errorCode === null ? "SAVING_FOR_REVIEW" : "PREPARING_DRAFT",
      },
      errorCode,
    );
  }

  private async createAssistantOutcome(
    payload: WorkflowJobPayload,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const assistant = await this.db.chatMessage.create({
      data: {
        sessionId: payload.sessionId,
        role: "ASSISTANT",
        content,
        status: "COMPLETED",
        correlationId: payload.correlationId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    const mapped = toMessage({ ...assistant, attachments: [] });
    this.emit({
      type: "message.created",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: mapped.createdAt,
      message: mapped,
    });
  }

  private async extractAttachment(attachment: {
    id: string;
    workspaceId: string;
    sessionId: string;
    storedName: string;
    mimeType: string;
  }, payload: WorkflowJobPayload, summary?: ChatAttachmentSummary): Promise<{
    status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
    text?: string;
  }> {
    await this.db.chatAttachment.update({
      where: { id: attachment.id },
      data: { extractionStatus: "RUNNING" },
    });
    this.emitAttachmentStatus(payload, summary, "RUNNING");
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
      await this.db.chatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: result.status,
          extractedText: result.text ?? null,
          sourceScript: result.sourceScript ?? null,
          extractionError: result.error ?? null,
          extractedAt: new Date(),
        },
      });
      this.emitAttachmentStatus(
        payload,
        summary,
        result.status,
        result.sourceScript ?? null,
      );
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Extraction failed";
      await this.db.chatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: "FAILED",
          extractionError: message,
          extractedAt: new Date(),
        },
      });
      this.emitAttachmentStatus(payload, summary, "FAILED");
      return { status: "FAILED", text: undefined };
    }
  }

  private emitAttachmentStatus(
    payload: WorkflowJobPayload,
    attachment: ChatAttachmentSummary | undefined,
    extractionStatus: ChatAttachmentSummary["extractionStatus"],
    sourceScript: ChatAttachmentSummary["sourceScript"] = null,
  ): void {
    if (!attachment) return;
    this.emit({
      type: "attachment.updated",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: new Date().toISOString(),
      attachment: { ...attachment, extractionStatus, sourceScript },
    });
  }

  private truncateForJobOutput(text: string | undefined): string | undefined {
    if (!text) return text;
    const max = this.config.extractionTextMaxChars;
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  private async markFailed(
    jobId: string,
    payload: WorkflowJobPayload,
    errorCode: string,
  ): Promise<void> {
    const record = await this.db.workflowJob.findUnique({ where: { id: jobId } });
    if (!record) return;
    await this.transitionJob(record, payload, "FAILED", undefined, errorCode);
  }

  private initialStage(
    name: WorkflowName,
    record: WorkflowJobRecord,
  ): WorkflowProgressStage {
    switch (name) {
      case "triage":
        return "UNDERSTANDING_REQUEST";
      case "answering":
        return "PREPARING_ANSWER";
      case "brief-extraction":
        return (record.input as BriefExtractionInput | null)?.attachments.length
          ? "READING_ATTACHMENTS"
          : "EXTRACTING_FACTS";
      case "drafting":
        return "PREPARING_DRAFT";
      default:
        return "UNDERSTANDING_REQUEST";
    }
  }

  private async transitionJob(
    record: WorkflowJobRecord,
    payload: WorkflowJobPayload,
    status: WorkflowJobStatus,
    output?: Record<string, unknown>,
    errorCode: string | null = null,
  ): Promise<WorkflowJobRecord> {
    const job = await this.db.workflowJob.update({
      where: { id: record.id },
      data: {
        status,
        errorCode,
        ...(output ? { output: JSON.parse(JSON.stringify(output)) } : {}),
      },
    });
    this.emit({
      type: "job.updated",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: job.updatedAt.toISOString(),
      job: toJob(job),
    });
    return job as WorkflowJobRecord;
  }

  private emit(event: ChatStreamEvent): void {
    this.events.emit(event);
  }
}

/**
 * No-Redis fallback used when `ChatService` is constructed without a real
 * `WorkflowQueuePort` (e.g. plain `new ChatService(...)` in unit tests): runs
 * the workflow synchronously in-process instead of going through BullMQ.
 */
export function createInlineWorkflowQueue(
  prisma: PlatformPrismaService,
  events: ChatEventBus,
  storage: ChatStorageService,
  config: ChatRuntimeConfig,
  provider: ChatModelProvider | undefined,
): WorkflowQueuePort {
  const holder: { runner?: WorkflowRunner } = {};
  const queue: WorkflowQueuePort = {
    enqueue: (name, _jobId, payload) => {
      if (!holder.runner) {
        throw new Error("Inline workflow queue used before initialization");
      }
      return holder.runner.run(name, payload);
    },
  };
  holder.runner = new WorkflowRunner(
    prisma,
    events,
    storage,
    config,
    provider,
    queue,
  );
  return queue;
}
