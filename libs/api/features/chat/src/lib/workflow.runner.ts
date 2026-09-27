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
import {
  AgentTurnInput,
  AgentTurnRunner,
  WorkflowJobTelemetry,
} from "./agent-turn.runner";
import { AssistantContextBuilder } from "./assistant-context.builder";
import { AssistantDraftingService } from "./assistant-drafting.service";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { resolveChatModelProvider } from "./chat-model.util";
import { toJob, toMessage } from "./chat.mappers";
import {
  WORKFLOW_QUEUE_PORT,
  WorkflowJobPayload,
  WorkflowQueuePort,
} from "./workflow-queue.types";

type JobRow = NonNullable<
  Awaited<ReturnType<PlatformPrismaService["workflowJob"]["findUnique"]>>
>;

interface TriageInput {
  actorId: string;
  content: string;
  attachments: ChatAttachmentSummary[];
}

/** Input of `answering` jobs created before the agent became the only engine. */
interface LegacyAnsweringInput {
  messageId?: string;
  userText: string;
  attachments: ChatAttachmentSummary[];
  language: "sr" | "en";
}

/**
 * Dispatches BullMQ `workflow` jobs. Portir triage is the guardrail; every
 * legal request becomes a Mastra `agent-turn`. Queued `brief-extraction` /
 * `drafting` jobs (retries, draft-review revisions) run through the Mastra
 * drafting workflows. Invoked by `WorkflowProcessor` or, without Redis, by
 * the in-process `createInlineWorkflowQueue`.
 */
@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly config: ChatRuntimeConfig,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider: ChatModelProvider | undefined,
    @Inject(WORKFLOW_QUEUE_PORT)
    private readonly workflowQueue: WorkflowQueuePort,
    @Optional()
    private readonly contextBuilder?: AssistantContextBuilder,
    @Optional()
    private readonly agentTurn?: AgentTurnRunner,
    @Optional()
    private readonly drafting?: AssistantDraftingService,
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
    if (
      record.status === "COMPLETED" ||
      record.status === "WAITING_CONFIRMATION"
    ) {
      return;
    }

    const running = await this.transitionJob(
      record,
      payload,
      "RUNNING",
      { progressStage: this.initialStage(name, record) },
      null,
      { startedAt: new Date(), finishedAt: null },
    );

    switch (name) {
      case "triage":
        return this.runTriage(running, payload);
      case "agent-turn":
      case "agent-resume":
        return this.runAgentTurn(
          running,
          payload,
          running.input as unknown as AgentTurnInput | null,
        );
      case "answering":
        return this.runAgentTurn(
          running,
          payload,
          await this.fromLegacyAnswering(running),
        );
      case "brief-extraction":
        return this.runDraftingJob(running, payload, "brief");
      case "drafting":
        return this.runDraftingJob(running, payload, "draft");
      default:
        throw new Error(`Unsupported workflow: ${name}`);
    }
  }

  /** Portir guardrail: refuse non-legal requests, send legal ones to the agent. */
  private async runTriage(
    record: JobRow,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    const input = record.input as unknown as TriageInput | null;
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
      // The agent is multi-turn, so the guardrail sees earlier turns to accept
      // follow-ups, and accepts practice-management requests the agent can act on.
      const history = await this.contextBuilder?.triageHistory(
        payload.sessionId,
        payload.messageId,
      );
      result = await runPortirGraph(provider, {
        userText: input.content,
        attachments: input.attachments,
        history,
        practiceActions: true,
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

    const triageOutput = {
      progressStage: "UNDERSTANDING_REQUEST",
      decision: result.decision.decision,
      reason: result.decision.reason,
    };
    if (!result.accepted) {
      await this.createAssistantOutcome(payload, result.assistantContent, {
        reason: result.decision.reason,
        triageDecision: result.decision.decision,
      });
      await this.transitionJob(record, payload, "COMPLETED", triageOutput);
      return;
    }

    const turnInput: AgentTurnInput = {
      messageId: payload.messageId ?? "",
      userText: input.content,
      attachments: input.attachments,
      language: result.decision.language,
      intent: result.decision.intent,
    };
    const turn = await this.db.workflowJob.create({
      data: {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        workflowName: "agent-turn",
        status: "QUEUED",
        correlationId: payload.correlationId,
        input: JSON.parse(JSON.stringify(turnInput)),
      },
    });
    this.emit({
      type: "job.queued",
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
      createdAt: turn.createdAt.toISOString(),
      job: toJob(turn),
    });

    await this.transitionJob(record, payload, "COMPLETED", triageOutput);

    await this.workflowQueue.enqueue("agent-turn", turn.id, {
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      jobId: turn.id,
      correlationId: payload.correlationId,
      messageId: payload.messageId,
    });
  }

  private async runAgentTurn(
    record: JobRow,
    payload: WorkflowJobPayload,
    input: AgentTurnInput | null,
  ): Promise<void> {
    if (!this.agentTurn) {
      await this.markFailed(record.id, payload, "AGENT_TURN_UNAVAILABLE");
      return;
    }
    await this.agentTurn.run(input, payload, {
      transition: (status, output, errorCode, telemetry) =>
        this.transitionJob(
          record,
          payload,
          status,
          output,
          errorCode ?? null,
          telemetry,
        ),
    });
  }

  /**
   * Historical `answering` jobs (retry, regenerate, or still queued at
   * deploy) run as an agent turn; their triggering user message is the one
   * that shares the correlation id.
   */
  private async fromLegacyAnswering(
    record: JobRow,
  ): Promise<AgentTurnInput | null> {
    const input = record.input as unknown as LegacyAnsweringInput | null;
    if (!input) return null;
    const trigger = input.messageId
      ? { id: input.messageId }
      : await this.db.chatMessage.findFirst({
          where: {
            sessionId: record.sessionId,
            correlationId: record.correlationId,
            role: "USER",
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
    if (!trigger) return null;
    return {
      messageId: trigger.id,
      userText: input.userText,
      attachments: input.attachments ?? [],
      language: input.language === "en" ? "en" : "sr",
      intent: "ANSWER",
    };
  }

  /** Queued brief/draft jobs run on the Mastra drafting workflows. */
  private async runDraftingJob(
    record: JobRow,
    payload: WorkflowJobPayload,
    kind: "brief" | "draft",
  ): Promise<void> {
    if (!this.drafting) {
      await this.markFailed(record.id, payload, "DRAFTING_UNAVAILABLE");
      return;
    }
    if (kind === "brief") {
      await this.drafting.runBriefJob(record);
    } else {
      await this.drafting.runDraftingJob(record);
    }
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

  private async markFailed(
    jobId: string,
    payload: WorkflowJobPayload,
    errorCode: string,
  ): Promise<void> {
    const record = await this.db.workflowJob.findUnique({
      where: { id: jobId },
    });
    if (!record) return;
    await this.transitionJob(record, payload, "FAILED", undefined, errorCode);
  }

  private initialStage(
    name: WorkflowName,
    record: JobRow,
  ): WorkflowProgressStage {
    switch (name) {
      case "triage":
        return "UNDERSTANDING_REQUEST";
      case "answering":
      case "agent-turn":
      case "agent-resume":
        return "PREPARING_ANSWER";
      case "brief-extraction":
        return (record.input as { attachments?: unknown[] } | null)?.attachments
          ?.length
          ? "READING_ATTACHMENTS"
          : "EXTRACTING_FACTS";
      case "drafting":
        return "PREPARING_DRAFT";
      default:
        return "UNDERSTANDING_REQUEST";
    }
  }

  private async transitionJob(
    record: JobRow,
    payload: WorkflowJobPayload,
    status: WorkflowJobStatus,
    output?: Record<string, unknown>,
    errorCode: string | null = null,
    telemetry: WorkflowJobTelemetry = {},
  ): Promise<JobRow> {
    const terminal = status === "COMPLETED" || status === "FAILED";
    const job = await this.db.workflowJob.update({
      where: { id: record.id },
      data: {
        status,
        errorCode,
        ...(output ? { output: JSON.parse(JSON.stringify(output)) } : {}),
        ...(terminal ? { finishedAt: new Date() } : {}),
        ...telemetry,
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
    return job;
  }

  private emit(event: ChatStreamEvent): void {
    this.events.emit(event);
  }
}

/**
 * No-Redis fallback used when `ChatService` is constructed without a real
 * `WorkflowQueuePort` (e.g. plain `new ChatService(...)` in unit tests): runs
 * triage synchronously in-process. Without the agent runner, accepted
 * requests end as `AGENT_TURN_UNAVAILABLE`.
 */
export function createInlineWorkflowQueue(
  prisma: PlatformPrismaService,
  events: ChatEventBus,
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
  holder.runner = new WorkflowRunner(prisma, events, config, provider, queue);
  return queue;
}
