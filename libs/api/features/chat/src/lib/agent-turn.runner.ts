import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import type {
  ChatAttachmentSummary,
  ChatStreamEvent,
  WorkflowJobStatus,
} from "@law/api-interfaces";
import { PlatformPrismaService } from "@law/core";
import {
  extractUsedMarkerNumbers,
  filterUsedCitations,
} from "@law/legal-grounding";
import {
  CitationRegistry,
  createLegalAssistantAgent,
  createLegalAssistantRequestContext,
  LEGAL_ASSISTANT_MAX_STEPS,
  openRouterModel,
} from "@law/mastra";
import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { AssistantContextBuilder } from "./assistant-context.builder";
import { AssistantToolsAdapter } from "./assistant-tools.adapter";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { toMessage } from "./chat.mappers";
import type { WorkflowJobPayload } from "./workflow-queue.types";

/** Test seam: overrides the agent's model (e.g. a scripted mock). */
export const ASSISTANT_AGENT_MODEL = "ASSISTANT_AGENT_MODEL";

export interface AgentTurnInput {
  messageId: string;
  userText: string;
  attachments: ChatAttachmentSummary[];
  language: "sr" | "en";
}

/** Job status updates stay with WorkflowRunner, which owns WorkflowJob rows. */
export interface AgentTurnJobPort {
  transition(
    status: WorkflowJobStatus,
    output?: Record<string, unknown>,
    errorCode?: string | null,
  ): Promise<unknown>;
}

const PERSIST_INTERVAL_MS = 500;

/**
 * Chat orchestrator for one `agent-turn` job: context builder → legalAssistant
 * agent → streamed deltas → persisted answer with citations.
 */
@Injectable()
export class AgentTurnRunner {
  private readonly logger = new Logger(AgentTurnRunner.name);
  private agent?: Agent;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly config: ChatRuntimeConfig,
    private readonly contextBuilder: AssistantContextBuilder,
    private readonly tools: AssistantToolsAdapter,
    @Optional()
    @Inject(ASSISTANT_AGENT_MODEL)
    private readonly modelOverride?: MastraModelConfig,
  ) {}

  async run(
    input: AgentTurnInput | null,
    payload: WorkflowJobPayload,
    job: AgentTurnJobPort,
  ): Promise<void> {
    if (!input) {
      await job.transition("FAILED", undefined, "AGENT_TURN_INPUT_MISSING");
      return;
    }

    const assistant = await this.prisma.chatMessage.create({
      data: {
        sessionId: payload.sessionId,
        role: "ASSISTANT",
        content: "",
        status: "PENDING",
        correlationId: payload.correlationId,
        metadata: { outcome: "ANSWER" },
      },
    });
    const pending = toMessage({ ...assistant, attachments: [] });
    this.emit(payload, {
      type: "message.started",
      createdAt: pending.createdAt,
      message: pending,
    });

    let content = "";
    try {
      const context = await this.contextBuilder.build({
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        messageId: input.messageId,
      });
      const citations = new CitationRegistry();
      const stream = await this.resolveAgent().stream(context.messages, {
        requestContext: createLegalAssistantRequestContext({
          workspaceId: payload.workspaceId,
          sessionCaseId: context.sessionCaseId,
          language: input.language,
          caseContext: context.caseContext,
          citations,
        }),
        maxSteps: LEGAL_ASSISTANT_MAX_STEPS,
        modelSettings: { temperature: 0 },
      });

      let persistedAt = Date.now();
      for await (const delta of stream.textStream) {
        if (!delta) continue;
        content += delta;
        this.emit(payload, {
          type: "message.delta",
          createdAt: new Date().toISOString(),
          messageId: assistant.id,
          delta,
        });
        if (Date.now() - persistedAt >= PERSIST_INTERVAL_MS) {
          persistedAt = Date.now();
          await this.prisma.chatMessage.update({
            where: { id: assistant.id },
            data: { content },
          });
        }
      }
      if (stream.error) throw stream.error;
      if (!content.trim()) throw new Error("Agent returned an empty answer");

      const used = filterUsedCitations(
        citations.all(),
        extractUsedMarkerNumbers(content),
      );
      const completed = await this.prisma.chatMessage.update({
        where: { id: assistant.id },
        data: {
          content,
          status: "COMPLETED",
          metadata: {
            outcome: "ANSWER",
            ...(used.length
              ? {
                  citations: used.map((citation) => ({
                    marker: citation.marker,
                    articleNumber: citation.articleNumber,
                    sourceTitle: citation.sourceTitle,
                    sourceUrl: citation.sourceUrl,
                    snippet: citation.snippet,
                    score: citation.score,
                  })),
                }
              : {}),
          },
        },
      });
      const mapped = toMessage({ ...completed, attachments: [] });
      this.emit(payload, {
        type: "message.updated",
        createdAt: mapped.createdAt,
        message: mapped,
      });
      await job.transition("COMPLETED", {
        progressStage: "PREPARING_ANSWER",
        messageId: assistant.id,
        model: this.config.assistantModel,
      });
    } catch (error) {
      this.logger.error(
        `Agent turn failed for job ${payload.jobId} (session ${payload.sessionId}): ${
          error instanceof Error ? error.message : error
        }`,
      );
      await this.prisma.chatMessage.update({
        where: { id: assistant.id },
        data: { content, status: "FAILED" },
      });
      await job.transition(
        "FAILED",
        { progressStage: "PREPARING_ANSWER", messageId: assistant.id },
        "AGENT_TURN_FAILED",
      );
      this.emit(payload, {
        type: "error",
        createdAt: new Date().toISOString(),
        error:
          input.language === "en"
            ? "The assistant could not complete the answer."
            : "Asistent nije uspeo da završi odgovor.",
      });
    }
  }

  private resolveAgent(): Agent {
    if (this.agent) return this.agent;
    let model = this.modelOverride;
    if (!model) {
      if (!this.config.openRouterApiKey) {
        throw new BadRequestException(
          "OPENROUTER_API_KEY is not configured for the assistant",
        );
      }
      model = openRouterModel({
        apiKey: this.config.openRouterApiKey,
        baseUrl: this.config.openRouterBaseUrl,
        model: this.config.assistantModel,
      });
    }
    this.agent = createLegalAssistantAgent({ model, deps: this.tools });
    return this.agent;
  }

  private emit(
    payload: WorkflowJobPayload,
    event: Omit<ChatStreamEvent, "workspaceId" | "sessionId" | "correlationId">,
  ): void {
    this.events.emit({
      ...event,
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      correlationId: payload.correlationId,
    } as ChatStreamEvent);
  }
}
