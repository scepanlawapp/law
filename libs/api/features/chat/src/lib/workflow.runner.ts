import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ChatAttachmentSummary, ChatStreamEvent } from "@law/api-interfaces";
import { PrismaService } from "@law/core";
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
import { toJob, toMessage } from "./chat.mappers";
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
}

interface DraftingInput {
  briefResultId: string;
  messageId?: string;
  previousDraftId?: string;
  reviewerNote?: string;
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
    private readonly prisma: PrismaService,
    private readonly events: ChatEventBus,
    private readonly storage: ChatStorageService,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider: ChatModelProvider | undefined,
    @Inject(WORKFLOW_QUEUE_PORT)
    private readonly workflowQueue: WorkflowQueuePort,
  ) {}

  async run(name: WorkflowName, payload: WorkflowJobPayload): Promise<void> {
    const record = await this.prisma.workflowJob.findUnique({
      where: { id: payload.jobId },
    });
    if (!record) {
      this.logger.warn(
        `WorkflowJob ${payload.jobId} not found; skipping ${name}`,
      );
      return;
    }
    if (record.status === "COMPLETED") return;

    await this.prisma.workflowJob.update({
      where: { id: record.id },
      data: { status: "RUNNING" },
    });

    switch (name) {
      case "triage":
        return this.runTriage(record as WorkflowJobRecord, payload);
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
      sessionId: payload.sessionId,
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
        sessionId: payload.sessionId,
        createdAt: new Date().toISOString(),
        error: "Portir could not classify this message.",
      });
      return;
    }

    this.emit({
      type: "triage.completed",
      sessionId: payload.sessionId,
      createdAt: new Date().toISOString(),
      decision: result.decision.decision,
      reason: result.decision.reason,
    });

    const assistant = await this.prisma.chatMessage.create({
      data: {
        sessionId: payload.sessionId,
        role: "ASSISTANT",
        content: result.assistantContent,
        status: "COMPLETED",
        triageDecision: result.decision.decision,
        correlationId: payload.correlationId,
        metadata: { reason: result.decision.reason },
      },
    });
    const mapped = toMessage({ ...assistant, attachments: [] });
    this.emit({
      type: "message.created",
      sessionId: payload.sessionId,
      createdAt: mapped.createdAt,
      message: mapped,
    });

    let nextJobId: string | undefined;
    if (result.queueBriefExtraction) {
      const created = await this.prisma.workflowJob.create({
        data: {
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          workflowName: "brief-extraction",
          status: "QUEUED",
          correlationId: payload.correlationId,
          input: JSON.parse(
            JSON.stringify({
              actorId: input.actorId,
              messageId: mapped.id,
              userText: input.content,
              attachments: input.attachments,
            }),
          ),
        },
      });
      this.emit({
        type: "job.queued",
        sessionId: payload.sessionId,
        createdAt: created.createdAt.toISOString(),
        job: toJob(created),
      });
      nextJobId = created.id;
    }

    const completed = await this.prisma.workflowJob.update({
      where: { id: record.id },
      data: {
        status: "COMPLETED",
        output: JSON.parse(
          JSON.stringify({
            decision: result.decision.decision,
            reason: result.decision.reason,
          }),
        ),
      },
    });
    this.emit({
      type: "job.updated",
      sessionId: payload.sessionId,
      createdAt: completed.updatedAt.toISOString(),
      job: toJob(completed),
    });

    if (nextJobId) {
      await this.workflowQueue.enqueue("brief-extraction", nextJobId, {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        jobId: nextJobId,
        correlationId: payload.correlationId,
        messageId: mapped.id,
      });
    }
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

    const attachmentIds = input.attachments.map((attachment) => attachment.id);
    const attachments = attachmentIds.length
      ? await this.prisma.chatAttachment.findMany({
          where: { id: { in: attachmentIds } },
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
      input.userText.trim().length > 0 && input.userText !== "(attachment)";
    const hasContext =
      hasUserText ||
      briefDocuments.some((doc) => doc.status === "COMPLETED" && !!doc.text);

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

        const briefResult = await this.prisma.briefExtractionResult.create({
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

    const job = await this.prisma.workflowJob.update({
      where: { id: record.id },
      data: {
        status: "COMPLETED",
        errorCode,
        output: JSON.parse(JSON.stringify(output)),
      },
    });
    this.emit({
      type: "job.updated",
      sessionId: payload.sessionId,
      createdAt: job.updatedAt.toISOString(),
      job: toJob(job),
    });

    if (draftingTrigger) {
      const draftJob = await this.prisma.workflowJob.create({
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
            }),
          ),
        },
      });
      this.emit({
        type: "job.queued",
        sessionId: payload.sessionId,
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

    const briefResult = await this.prisma.briefExtractionResult.findUnique({
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
                    await this.prisma.draftResult.findUnique({
                      where: { id: input.previousDraftId },
                    })
                  )?.finalDocumentText ?? undefined)
                : undefined,
              reviewerNote: input.reviewerNote,
            }
          : undefined,
      );
      const draft = await runDraftingLlm(provider, prompt);

      await this.prisma.draftResult.create({
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
        `Drafting LLM failed for job ${record.id} (session ${payload.sessionId}): ${message}`,
      );
      output = { draftError: message };
      errorCode = "DRAFTING_LLM_FAILED";
    }

    const job = await this.prisma.workflowJob.update({
      where: { id: record.id },
      data: {
        status: "COMPLETED",
        errorCode,
        output: JSON.parse(JSON.stringify(output)),
      },
    });
    this.emit({
      type: "job.updated",
      sessionId: payload.sessionId,
      createdAt: job.updatedAt.toISOString(),
      job: toJob(job),
    });
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

  private async markFailed(
    jobId: string,
    payload: WorkflowJobPayload,
    errorCode: string,
  ): Promise<void> {
    const job = await this.prisma.workflowJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorCode },
    });
    this.emit({
      type: "job.updated",
      sessionId: payload.sessionId,
      createdAt: job.updatedAt.toISOString(),
      job: toJob(job),
    });
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
  prisma: PrismaService,
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
