import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import type {
  ChatAttachmentSummary,
  ChatStreamEvent,
  WorkflowJobStatus,
} from "@law/api-interfaces";
import { PlatformPrismaService } from "@law/core";
import { Prisma } from "@prisma/client";
import {
  extractUsedMarkerNumbers,
  filterUsedCitations,
} from "@law/legal-grounding";
import {
  CitationRegistry,
  createLawMastra,
  createLegalAssistantAgent,
  createLegalAssistantRequestContext,
  LEGAL_ASSISTANT_MAX_STEPS,
  openRouterModel,
} from "@law/mastra";
import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Mastra } from "@mastra/core/mastra";
import { AssistantContextBuilder } from "./assistant-context.builder";
import { AssistantToolsAdapter } from "./assistant-tools.adapter";
import { ChatRuntimeConfig } from "./chat.config";
import { ConversationSummaryService } from "./conversation-summary.service";
import { ChatEventBus } from "./chat.events";
import { belgradeToday } from "./assistant-actions.service";
import { toMessage, toPendingAction, toToolCall } from "./chat.mappers";
import type { WorkflowJobPayload } from "./workflow-queue.types";

/** Test seam: overrides the agent's model (e.g. a scripted mock). */
export const ASSISTANT_AGENT_MODEL = "ASSISTANT_AGENT_MODEL";

export interface AgentTurnInput {
  messageId: string;
  userText: string;
  attachments: ChatAttachmentSummary[];
  language: "sr" | "en";
  /** Portir's intent; drafting requests also go to the agent. */
  intent?: "ANSWER" | "DRAFT";
  /** `agent-resume`: pending actions whose decisions the agent reports. */
  resumeActionIds?: string[];
}

/** Run telemetry columns on WorkflowJob. */
export interface WorkflowJobTelemetry {
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/** Job status updates stay with WorkflowRunner, which owns WorkflowJob rows. */
export interface AgentTurnJobPort {
  transition(
    status: WorkflowJobStatus,
    output?: Record<string, unknown>,
    errorCode?: string | null,
    telemetry?: WorkflowJobTelemetry,
  ): Promise<unknown>;
}

const PERSIST_INTERVAL_MS = 500;
/** Tool inputs/outputs are stored for audit; very large results are truncated. */
const TOOL_PAYLOAD_MAX_CHARS = 8_000;

interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/**
 * Chat orchestrator for one `agent-turn` job: context builder → legalAssistant
 * agent → streamed deltas → persisted answer with citations.
 */
@Injectable()
export class AgentTurnRunner implements OnModuleDestroy {
  private readonly logger = new Logger(AgentTurnRunner.name);
  private agent?: Agent;
  private mastra?: Mastra;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly config: ChatRuntimeConfig,
    private readonly contextBuilder: AssistantContextBuilder,
    private readonly tools: AssistantToolsAdapter,
    @Optional()
    @Inject(ASSISTANT_AGENT_MODEL)
    private readonly modelOverride?: MastraModelConfig,
    @Optional() private readonly summaries?: ConversationSummaryService,
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
    let usage: TokenUsage = {};
    let toolCalls: ToolCallRecorder | undefined;
    let draftId: string | null = null;
    let proposalId: string | null = null;
    const pendingActionIds: string[] = [];
    const model = this.config.assistantModel;
    try {
      const resuming = !!input.resumeActionIds?.length;
      const context = await this.contextBuilder.build({
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        // A resume continues after the proposal message, so read up to now.
        messageId: resuming ? undefined : input.messageId,
      });
      if (resuming) {
        context.messages.push({
          role: "user",
          content: await this.decisionNote(
            payload.workspaceId,
            input.resumeActionIds ?? [],
          ),
        });
      }
      const citations = new CitationRegistry();
      toolCalls = new ToolCallRecorder(this.prisma, payload, (toolCall, type) =>
        this.emit(payload, {
          type,
          createdAt: new Date().toISOString(),
          toolCall,
        }),
      );
      const stream = await this.resolveAgent().stream(context.messages, {
        requestContext: createLegalAssistantRequestContext({
          workspaceId: payload.workspaceId,
          sessionCaseId: context.sessionCaseId,
          language: input.language,
          caseContext: context.caseContext,
          workspaceState: context.workspaceState,
          conversationSummary: context.conversationSummary,
          intent: input.intent ?? "ANSWER",
          turn: {
            workspaceId: payload.workspaceId,
            sessionId: payload.sessionId,
            jobId: payload.jobId,
            correlationId: payload.correlationId,
            messageId: input.messageId,
            language: input.language,
            userId: context.currentUser?.id ?? null,
            userDisplayName: context.currentUser?.displayName ?? null,
          },
          today: belgradeToday(),
          citations,
        }),
        maxSteps: LEGAL_ASSISTANT_MAX_STEPS,
        modelSettings: { temperature: 0 },
      });

      let persistedAt = Date.now();
      for await (const chunk of stream.fullStream) {
        switch (chunk.type) {
          case "text-delta": {
            const delta = chunk.payload.text;
            if (!delta) break;
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
            break;
          }
          case "tool-call":
            await toolCalls.start(chunk.payload);
            break;
          case "tool-result":
            await toolCalls.finish(chunk.payload.toolCallId, {
              output: chunk.payload.result,
              error: chunk.payload.isError ? chunk.payload.result : undefined,
            });
            draftId = readyDraftId(chunk.payload.result) ?? draftId;
            proposalId = proposedActionId(chunk.payload.result);
            if (proposalId) pendingActionIds.push(proposalId);
            break;
          case "tool-error":
            await toolCalls.finish(chunk.payload.toolCallId, {
              error: chunk.payload.error,
            });
            break;
        }
      }
      usage = await readUsage(stream.totalUsage);
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
            // A turn that produced a draft points the UI at it; it is not
            // regenerable (that would create another draft).
            ...(draftId
              ? { outcome: "DRAFT_READY", draftId }
              : { outcome: "ANSWER" }),
            ...(pendingActionIds.length ? { pendingActionIds } : {}),
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
      // Proposals keep the run open until every one is decided.
      await job.transition(
        pendingActionIds.length ? "WAITING_CONFIRMATION" : "COMPLETED",
        {
          progressStage: "PREPARING_ANSWER",
          messageId: assistant.id,
          ...(pendingActionIds.length ? { pendingActionIds } : {}),
        },
        null,
        { model, ...usage },
      );
      // After the answer is saved: fold turns that left the window into the
      // rolling summary. Best-effort; never fails the turn.
      await this.summaries?.refresh(payload.workspaceId, payload.sessionId);
    } catch (error) {
      this.logger.error(
        `Agent turn failed for job ${payload.jobId} (session ${payload.sessionId}): ${
          error instanceof Error ? error.message : error
        }`,
      );
      await toolCalls?.failUnfinished(error);
      await this.prisma.chatMessage.update({
        where: { id: assistant.id },
        data: { content, status: "FAILED" },
      });
      await job.transition(
        "FAILED",
        { progressStage: "PREPARING_ANSWER", messageId: assistant.id },
        "AGENT_TURN_FAILED",
        { model, ...usage },
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

  /** The user's decisions, as the synthetic last turn of an `agent-resume`. */
  private async decisionNote(
    workspaceId: string,
    actionIds: string[],
  ): Promise<string> {
    const actions = await this.prisma.pendingAction.findMany({
      where: { id: { in: actionIds }, workspaceId },
      orderBy: { createdAt: "asc" },
    });
    const lines = actions.map((action) => {
      const summary = toPendingAction(action);
      switch (summary.status) {
        case "APPROVED":
          return `Odobreno i izvršeno: ${summary.summary}. ${summary.resultMessage ?? ""}`.trim();
        case "DECLINED":
          return `Odbijeno: ${summary.summary}.${
            action.declineReason ? ` Razlog: ${action.declineReason}` : ""
          }`;
        case "FAILED":
          return `Odobreno, ali neuspešno: ${summary.summary}. Greška: ${summary.errorMessage ?? "nepoznata"}`;
        case "EXPIRED":
          return `Isteklo bez odluke: ${summary.summary}.`;
        default:
          return `Još nije odlučeno: ${summary.summary}.`;
      }
    });
    return [
      "[Potvrda] Odluke korisnika o predloženim radnjama:",
      ...lines,
    ].join("\n");
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
    const agent = createLegalAssistantAgent({ model, deps: this.tools });
    if (this.config.mastraTracing && this.config.databaseUrl) {
      // Registering the agent on a Mastra instance with observability traces
      // its runs, tool calls, and model calls into the `mastra` schema.
      this.mastra = createLawMastra({
        connectionString: this.config.databaseUrl,
        tracing: true,
        agents: { legalAssistant: agent },
      });
      this.agent = this.mastra.getAgent("legalAssistant");
    } else {
      this.agent = agent;
    }
    return this.agent;
  }

  async onModuleDestroy(): Promise<void> {
    await this.mastra?.shutdown();
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

async function readUsage(
  usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }>,
): Promise<TokenUsage> {
  try {
    const value = await usage;
    return {
      inputTokens: value?.inputTokens ?? null,
      outputTokens: value?.outputTokens ?? null,
    };
  } catch {
    return {};
  }
}

function toStoredJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value) ?? "null";
  return json.length > TOOL_PAYLOAD_MAX_CHARS
    ? { truncated: true, preview: json.slice(0, TOOL_PAYLOAD_MAX_CHARS) }
    : (JSON.parse(json) as Prisma.InputJsonValue);
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return (message ?? "Tool failed").slice(0, 500);
}

/** Persists one AgentToolCall row per tool call and emits tool events. */
class ToolCallRecorder {
  private readonly open = new Map<
    string,
    { id: string; toolName: string; input: unknown; startedAt: Date }
  >();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly payload: WorkflowJobPayload,
    private readonly notify: (
      toolCall: ReturnType<typeof toToolCall>,
      type: "tool.started" | "tool.finished",
    ) => void,
  ) {}

  async start(call: {
    toolCallId: string;
    toolName: string;
    args?: unknown;
  }): Promise<void> {
    if (this.open.has(call.toolCallId)) return;
    const input = stripMastraMetadata(call.args);
    const row = await this.prisma.agentToolCall.create({
      data: {
        workspaceId: this.payload.workspaceId,
        sessionId: this.payload.sessionId,
        jobId: this.payload.jobId,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: toStoredJson(input),
        status: "RUNNING",
      },
    });
    this.open.set(call.toolCallId, {
      id: row.id,
      toolName: call.toolName,
      input,
      startedAt: row.startedAt,
    });
    this.notify(toToolCall(row, this.payload.correlationId), "tool.started");
  }

  async finish(
    toolCallId: string,
    result: { output?: unknown; error?: unknown },
  ): Promise<void> {
    const open = this.open.get(toolCallId);
    if (!open) return;
    this.open.delete(toolCallId);
    const finishedAt = new Date();
    const failed = result.error !== undefined;
    const row = await this.prisma.agentToolCall.update({
      where: { id: open.id },
      data: {
        status: failed ? "FAILED" : "COMPLETED",
        output: toStoredJson(failed ? undefined : result.output),
        errorMessage: failed ? errorMessage(result.error) : null,
        durationMs: finishedAt.getTime() - open.startedAt.getTime(),
        finishedAt,
      },
    });
    this.notify(toToolCall(row, this.payload.correlationId), "tool.finished");
  }

  async failUnfinished(error: unknown): Promise<void> {
    for (const toolCallId of [...this.open.keys()]) {
      await this.finish(toolCallId, { error }).catch(() => undefined);
    }
  }
}

function stripMastraMetadata(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const { __mastraMetadata: _ignored, ...rest } = args as Record<
    string,
    unknown
  >;
  return rest;
}

/** Draft id from a successful draft_document / revise_draft tool result. */
function readyDraftId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const value = result as { status?: unknown; draftId?: unknown };
  return value.status === "DRAFT_READY" && typeof value.draftId === "string"
    ? value.draftId
    : null;
}

/** Pending action id from a CONFIRMATION_REQUIRED tool result. */
function proposedActionId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const value = result as { status?: unknown; pendingActionId?: unknown };
  return value.status === "CONFIRMATION_REQUIRED" &&
    typeof value.pendingActionId === "string"
    ? value.pendingActionId
    : null;
}
