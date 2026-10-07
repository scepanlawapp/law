import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { ChatStreamEvent } from "@law/api-interfaces";
import { PlatformPrismaService } from "@law/core";
import type { ChatModelProvider } from "@law/llm";
import {
  createCaseTimelineWorkflow,
  runCaseTimelineWorkflow,
  type AssistantTurnScope,
  type CaseTimelineToolResult,
} from "@law/mastra";
import { toLatin } from "@law/transliteration";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { resolveChatModelProvider } from "./chat-model.util";
import { toCaseTimeline } from "./chat.mappers";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";

const MAX_DOCUMENTS = 20;
const WINDOW_CHARS = 12_000;
const MAX_CHARS_PER_DOCUMENT = 24_000;
const SUMMARY_MAX_CHARS = 30_000;
const CONCURRENCY = 3;

/**
 * Case timeline behind the assistant's summarize_case_documents tool. Reads
 * the conversation's case documents and attachments, runs the Mastra
 * case-timeline workflow, and stores a read-only DocumentAnalysis row.
 * It never changes cases, clients, tasks, deadlines, or documents.
 */
@Injectable()
export class AssistantCaseTimelineService {
  private readonly logger = new Logger(AssistantCaseTimelineService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly config: ChatRuntimeConfig,
    @Optional() private readonly documentReads?: AssistantDocumentReadsService,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
  ) {}

  async summarizeCaseDocuments(
    scope: AssistantTurnScope,
    args: { documentRefs?: string[]; focus?: string },
  ): Promise<CaseTimelineToolResult> {
    if (!this.documentReads) {
      return {
        status: "FAILED",
        message: "Čitanje dokumenata trenutno nije dostupno.",
      };
    }
    const { caseId, caseNumber, documents, skipped } =
      await this.documentReads.documentsForTimeline(scope, {
        refs: args.documentRefs,
        limit: MAX_DOCUMENTS,
      });
    if (!documents.length) {
      return {
        status: "NO_DOCUMENTS",
        message: args.documentRefs?.length
          ? "Navedeni dokumenti nisu pronađeni."
          : "Razgovor nema povezan predmet sa dokumentima ni priložene fajlove.",
      };
    }
    const focus = args.focus?.trim() ? toLatin(args.focus.trim()) : null;

    let outcome;
    try {
      outcome = await runCaseTimelineWorkflow(
        createCaseTimelineWorkflow({
          provider: resolveChatModelProvider(this.config, this.provider),
        }),
        {
          focus,
          documents,
          skipped,
          budget: {
            windowChars: WINDOW_CHARS,
            maxCharsPerDocument: MAX_CHARS_PER_DOCUMENT,
            summaryMaxChars: SUMMARY_MAX_CHARS,
            concurrency: CONCURRENCY,
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Case timeline failed (session ${scope.sessionId}, job ${scope.jobId}): ${message}`,
      );
      return { status: "FAILED", message: "Izrada hronologije nije uspela." };
    }

    const row = await this.prisma.documentAnalysis.create({
      data: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        caseId,
        jobId: scope.jobId || null,
        kind: "CASE_TIMELINE",
        documentRef: caseId ? `case:${caseId}` : `session:${scope.sessionId}`,
        documentTitle: caseNumber
          ? `Predmet ${caseNumber}`
          : "Dokumenti razgovora",
        contractType: null,
        clientSide: null,
        result: JSON.parse(JSON.stringify(outcome.result)),
        citations: [],
        promptChars: outcome.promptChars,
        truncated: outcome.truncated,
        model: this.config.openRouterModel,
      },
    });
    const analysis = toCaseTimeline(row);
    this.emit(scope, {
      type: "analysis.updated",
      createdAt: analysis.createdAt,
      analysis,
    });

    const dated = analysis.result.events.filter((event) => event.date);
    return {
      status: "TIMELINE_READY",
      analysisId: analysis.id,
      case: caseNumber,
      documentCount: analysis.result.sources.length,
      eventCount: analysis.result.events.length,
      firstDate: dated[0]?.date ?? null,
      lastDate: dated[dated.length - 1]?.date ?? null,
      summary: analysis.result.summary,
      openQuestions: analysis.result.openQuestions,
      notRead: analysis.result.sources
        .filter(
          (source) => source.status !== "READ" && source.status !== "TRUNCATED",
        )
        .map((source) => source.title),
    };
  }

  private emit(
    scope: AssistantTurnScope,
    event: Omit<ChatStreamEvent, "workspaceId" | "sessionId" | "correlationId">,
  ): void {
    this.events.emit({
      ...event,
      workspaceId: scope.workspaceId,
      sessionId: scope.sessionId,
      correlationId: scope.correlationId,
    } as ChatStreamEvent);
  }
}
