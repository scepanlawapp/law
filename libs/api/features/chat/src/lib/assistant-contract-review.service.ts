import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { ChatStreamEvent, ContractReviewType } from "@law/api-interfaces";
import { getContractChecklist } from "@law/contract-review";
import { PlatformPrismaService } from "@law/core";
import { LegalKnowledgeService } from "@law/legal-knowledge";
import type { ChatModelProvider } from "@law/llm";
import {
  createContractReviewWorkflow,
  runContractReviewWorkflow,
  type AssistantTurnScope,
  type ContractReviewToolResult,
} from "@law/mastra";
import { toLatin } from "@law/transliteration";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { resolveChatModelProvider } from "./chat-model.util";
import { toContractReview } from "./chat.mappers";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";
import { MatterLinkService } from "./matter-link.service";

const TOP_ISSUES = 8;

/**
 * Contract review behind the assistant's review_contract tool. Reads the
 * document through the assistant's document reads, runs the Mastra
 * contract-review workflow, and stores a read-only DocumentAnalysis row.
 * It never changes cases, clients, tasks, deadlines, or documents.
 */
@Injectable()
export class AssistantContractReviewService {
  private readonly logger = new Logger(AssistantContractReviewService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly config: ChatRuntimeConfig,
    private readonly matterLink: MatterLinkService,
    @Optional() private readonly documentReads?: AssistantDocumentReadsService,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
    @Optional() private readonly legalKnowledge?: LegalKnowledgeService,
  ) {}

  async reviewContract(
    scope: AssistantTurnScope,
    args: {
      documentRef: string;
      contractType: ContractReviewType;
      clientSide?: string;
      focus?: string;
    },
  ): Promise<ContractReviewToolResult> {
    if (!this.documentReads) {
      return {
        status: "FAILED",
        message: "Čitanje dokumenata trenutno nije dostupno.",
      };
    }
    const ref = args.documentRef.trim();
    const [document] = await this.documentReads.documentsByRef(scope, [ref]);
    if (!document) {
      return {
        status: "NOT_FOUND",
        message: `Dokument "${ref}" nije pronađen. Koristite list_documents.`,
      };
    }
    if (document.status !== "COMPLETED" || !document.text?.trim()) {
      return {
        status: "NO_TEXT",
        message: `Dokument „${document.name}” nema čitljiv tekst za pregled.`,
      };
    }
    const checklist = getContractChecklist(args.contractType);
    const clientSide = args.clientSide?.trim()
      ? toLatin(args.clientSide.trim())
      : null;
    const focus = args.focus?.trim() ? toLatin(args.focus.trim()) : null;

    let outcome;
    try {
      outcome = await runContractReviewWorkflow(
        createContractReviewWorkflow({
          provider: resolveChatModelProvider(this.config, this.provider),
          search: (query, limit) =>
            this.legalKnowledge
              ? this.legalKnowledge.search(query, limit, scope.workspaceId)
              : Promise.resolve([]),
        }),
        {
          contractType: checklist.id,
          clientSide,
          focus,
          documentTitle: document.name,
          text: document.text,
          budget: { maxChars: this.config.contractReviewMaxChars },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Contract review failed (session ${scope.sessionId}, job ${scope.jobId}): ${message}`,
      );
      return { status: "FAILED", message: "Pregled ugovora nije uspeo." };
    }

    const caseId = await this.matterLink.sessionCaseId(
      scope.workspaceId,
      scope.sessionId,
    );
    const citations = outcome.citations.map((citation) => ({
      marker: citation.marker,
      articleNumber: citation.articleNumber,
      sourceTitle: citation.sourceTitle,
      sourceUrl: citation.sourceUrl,
      snippet: citation.snippet,
      score: citation.score,
    }));
    const row = await this.prisma.documentAnalysis.create({
      data: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        caseId,
        jobId: scope.jobId || null,
        kind: "CONTRACT_REVIEW",
        documentRef: document.id,
        documentTitle: document.name,
        contractType: checklist.id,
        clientSide,
        result: JSON.parse(JSON.stringify(outcome.result)),
        citations: JSON.parse(JSON.stringify(citations)),
        promptChars: outcome.promptChars,
        truncated: outcome.truncated,
        model: this.config.openRouterModel,
      },
    });
    const analysis = toContractReview(row);
    this.emit(scope, {
      type: "analysis.updated",
      createdAt: analysis.createdAt,
      analysis,
    });

    const issues = analysis.result.issues;
    const count = (risk: string) =>
      issues.filter((issue) => issue.risk === risk).length;
    return {
      status: "REVIEW_READY",
      analysisId: analysis.id,
      documentTitle: analysis.documentTitle,
      contractType: checklist.label,
      summary: analysis.result.summary,
      issueCounts: {
        high: count("HIGH"),
        medium: count("MEDIUM"),
        low: count("LOW"),
      },
      topIssues: issues.slice(0, TOP_ISSUES).map((issue) => ({
        title: issue.title,
        risk: issue.risk,
        category: issue.category,
        clause: issue.clause,
      })),
      missingClauses: analysis.result.missingClauses.map(
        (clause) => clause.title,
      ),
      citationCount: analysis.citations.length,
      truncated: analysis.truncated,
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
