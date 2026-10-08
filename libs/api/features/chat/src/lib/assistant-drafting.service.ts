import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  isDraftDocumentType,
  type ChatAttachmentSummary,
  type ChatStreamEvent,
  type DraftDocumentType,
  type WorkflowJobStatus,
  type WorkflowProgressStage,
} from "@law/api-interfaces";
import {
  DEFAULT_DOCUMENT_TYPE,
  getDocumentType,
  normalizeBrief,
  type BriefDocumentInput,
} from "@law/brief-extraction";
import { PlatformPrismaService } from "@law/core";
import { extractAttachmentText } from "@law/extraction";
import {
  DocumentContentService,
  contentAiStatus,
} from "@law/document-ingestion";
import { LegalKnowledgeService } from "@law/legal-knowledge";
import type { ChatModelProvider } from "@law/llm";
import {
  createDraftingWorkflows,
  runDraftingWorkflow,
  type AssistantTurnScope,
  type DraftingOutcome,
  type DraftListItem,
  type DraftReadResult,
  type DraftToolResult,
} from "@law/mastra";
import { toLatin } from "@law/transliteration";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { resolveChatModelProvider } from "./chat-model.util";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import {
  DocumentAccessPolicy,
  accessRefusalMessage,
} from "./document-access.policy";
import {
  ATTACHMENT_WITH_ACCESS,
  toDraft,
  toJob,
  toMessage,
} from "./chat.mappers";
import { ChatAttachmentStorage } from "@law/file-storage";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";
import { MatterLinkService } from "./matter-link.service";

const CONVERSATION_USER_MESSAGES = 10;
const CONVERSATION_ATTACHMENTS = 10;
const DRAFT_READ_MAX_CHARS = 12_000;
const DRAFT_EXCERPT_CHARS = 600;
const WORKSPACE_STATE_DRAFTS = 10;

type JobRecord = Awaited<
  ReturnType<PlatformPrismaService["workflowJob"]["create"]>
>;

type DraftRow = {
  id: string;
  previousDraftId: string | null;
  approvalStatus: string;
  createdAt: Date;
  documentText: string;
  finalDocumentText: string | null;
};

/**
 * Drafting operations behind the assistant's draft tools. Runs the Mastra
 * drafting workflows and persists through the same rows and events as the
 * legacy brief-extraction → drafting jobs, so the review UI works unchanged.
 * Draft writes are reversible: every draft awaits lawyer approval.
 */
@Injectable()
export class AssistantDraftingService {
  private readonly logger = new Logger(AssistantDraftingService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly storage: ChatAttachmentStorage,
    private readonly config: ChatRuntimeConfig,
    private readonly matterLink: MatterLinkService,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
    @Optional() private readonly legalKnowledge?: LegalKnowledgeService,
    @Optional() private readonly documentReads?: AssistantDocumentReadsService,
    @Optional() private readonly content?: DocumentContentService,
  ) {}

  async draftDocument(
    scope: AssistantTurnScope,
    args: {
      documentType: DraftDocumentType;
      note?: string;
      documentRefs?: string[];
    },
  ): Promise<DraftToolResult> {
    if (!isDraftDocumentType(args.documentType)) {
      return {
        status: "FAILED",
        message: "Ta vrsta dokumenta nije podržana za automatsku izradu.",
      };
    }
    const { userText, attachments } = await this.conversationInput(
      scope,
      args.note,
    );
    const documentRefs = args.documentRefs ?? [];
    const summaries = attachments.map(toAttachmentSummary);
    const briefJob = await this.createJob(
      scope,
      "brief-extraction",
      {
        messageId: scope.messageId,
        documentType: args.documentType,
        userText,
        attachments: summaries,
        documentRefs,
        language: scope.language,
        source: "agent",
      },
      attachments.length || documentRefs.length
        ? "READING_ATTACHMENTS"
        : "EXTRACTING_FACTS",
    );
    return this.runDocumentDraft(
      scope,
      briefJob,
      args.documentType,
      userText,
      attachments,
      documentRefs,
    );
  }

  /**
   * Runs a queued `brief-extraction` job (retry of a failed one, or a legacy
   * job still in the queue) through the Mastra document-drafting workflow.
   * Jobs stored before document types are lawsuits.
   */
  async runBriefJob(job: JobRecord): Promise<DraftToolResult> {
    const input = (job.input ?? {}) as {
      messageId?: string | null;
      documentType?: string;
      userText?: string;
      attachments?: Array<{ id: string }>;
      documentRefs?: string[];
      language?: "sr" | "en";
    };
    const scope = scopeFromJob(job, input);
    const attachmentIds = (input.attachments ?? []).map((item) => item.id);
    const attachments = attachmentIds.length
      ? await this.prisma.chatAttachment.findMany({
          where: {
            id: { in: attachmentIds },
            workspaceId: job.workspaceId,
            sessionId: job.sessionId,
          },
          ...ATTACHMENT_WITH_ACCESS,
        })
      : [];
    const userText =
      input.userText && input.userText !== "(attachment)"
        ? toLatin(input.userText)
        : "";
    const documentType = isDraftDocumentType(input.documentType)
      ? input.documentType
      : DEFAULT_DOCUMENT_TYPE;
    return this.runDocumentDraft(
      scope,
      job,
      documentType,
      userText,
      attachments,
      input.documentRefs ?? [],
    );
  }

  private async runDocumentDraft(
    scope: AssistantTurnScope,
    briefJob: JobRecord,
    documentType: DraftDocumentType,
    userText: string,
    attachments: AttachmentRow[],
    documentRefs: string[],
  ): Promise<DraftToolResult> {
    // Named documents first: they are what the draft answers (judgment,
    // lawsuit). An attachment already filed as one of them is not read twice.
    const named = new Set(documentRefs.map((ref) => ref.trim()));
    const documents = [
      ...(await this.documentsByRef(scope, documentRefs)),
      ...(await this.readDocuments(
        scope,
        attachments.filter(
          (attachment) =>
            !attachment.documentId ||
            !named.has(`doc:${attachment.documentId}`),
        ),
      )),
    ];
    const accessNotes = documents.flatMap((doc) =>
      doc.note ? [doc.note] : [],
    );
    const hasContext =
      userText.trim().length > 0 ||
      documents.some((doc) => doc.status === "COMPLETED" && !!doc.text);
    if (!hasContext) {
      await this.transition(scope, briefJob, "COMPLETED", {
        progressStage: "EXTRACTING_FACTS",
        brief: null,
        briefOutcome: "empty",
      });
      return {
        status: "NO_CONTEXT",
        message: [
          "Nema dovoljno čitljivih činjenica ni priloga za nacrt.",
          ...accessNotes,
        ].join(" "),
      };
    }

    let briefId: string | null = null;
    let draftJob: JobRecord | null = null;
    let briefDone = false;
    const { documentDrafting } = createDraftingWorkflows({
      provider: resolveChatModelProvider(this.config, this.provider),
      search: (query, limit) => this.search(scope.workspaceId, query, limit),
      onStage: async (stage) => {
        if (stage === "EXTRACTING_FACTS") {
          await this.transition(scope, briefJob, "RUNNING", {
            progressStage: "EXTRACTING_FACTS",
          });
        }
      },
      onBrief: async ({ brief, promptChars, truncated }) => {
        const row = await this.prisma.briefExtractionResult.create({
          data: {
            jobId: briefJob.id,
            workspaceId: scope.workspaceId,
            sessionId: scope.sessionId,
            messageId: scope.messageId || null,
            documentType: brief.documentType,
            brief: JSON.parse(JSON.stringify(brief)),
            confidence: brief.confidence,
            missingFields: JSON.parse(JSON.stringify(brief.missingFields)),
            promptChars,
            truncated,
            model: this.config.openRouterModel,
          },
        });
        briefId = row.id;
        briefDone = true;
        await this.transition(scope, briefJob, "COMPLETED", {
          progressStage: "EXTRACTING_FACTS",
          userText,
          attachments: documents.map(({ id, name, mimeType, status }) => ({
            attachmentId: id,
            originalName: name,
            mimeType,
            status,
          })),
          brief,
          briefResultId: row.id,
        });
        draftJob = await this.createJob(
          scope,
          "drafting",
          {
            briefResultId: row.id,
            messageId: scope.messageId,
            language: scope.language,
          },
          "PREPARING_DRAFT",
        );
      },
    });

    let outcome: DraftingOutcome;
    try {
      outcome = await runDraftingWorkflow(documentDrafting, {
        documentType,
        userText,
        documents,
        caseContext: await this.caseContext(scope),
        budget: this.budget(),
      });
    } catch (error) {
      await this.failJobs(scope, error, [
        briefDone ? null : { job: briefJob, code: "BRIEF_LLM_FAILED" },
        draftJob ? { job: draftJob, code: "DRAFTING_LLM_FAILED" } : null,
      ]);
      return { status: "FAILED", message: "Izrada nacrta nije uspela." };
    }

    if (!draftJob || !briefId) {
      return { status: "FAILED", message: "Izrada nacrta nije uspela." };
    }
    const saved = await this.saveDraft(scope, draftJob, briefId, outcome, null);
    return saved.status === "DRAFT_READY" && accessNotes.length
      ? { ...saved, warnings: [...accessNotes, ...saved.warnings] }
      : saved;
  }

  async reviseDraft(
    scope: AssistantTurnScope,
    args: { instruction: string; draftId?: string },
  ): Promise<DraftToolResult> {
    const previous = await this.findDraft(scope, args.draftId);
    if (!previous) {
      return {
        status: "NOT_FOUND",
        message: "U ovom razgovoru nema tog nacrta.",
      };
    }
    const briefRow = previous.briefResultId
      ? await this.prisma.briefExtractionResult.findFirst({
          where: { id: previous.briefResultId, workspaceId: scope.workspaceId },
        })
      : null;
    if (!briefRow) {
      return {
        status: "NOT_FOUND",
        message: "Za ovaj nacrt ne postoje izvučene činjenice.",
      };
    }
    const instruction = toLatin(args.instruction);
    const job = await this.createJob(
      scope,
      "drafting",
      {
        briefResultId: briefRow.id,
        messageId: scope.messageId,
        previousDraftId: previous.id,
        reviewerNote: instruction,
        language: scope.language,
      },
      "PREPARING_DRAFT",
    );
    return this.produceDraft(scope, job, briefRow, previous, instruction);
  }

  /**
   * Runs a queued `drafting` job: "request changes" from the draft review
   * panel, or a retry. Announces the result like the legacy drafting job.
   */
  async runDraftingJob(job: JobRecord): Promise<DraftToolResult> {
    const input = (job.input ?? {}) as {
      briefResultId?: string;
      messageId?: string | null;
      previousDraftId?: string | null;
      reviewerNote?: string | null;
      language?: "sr" | "en";
    };
    const scope = scopeFromJob(job, input);
    const briefRow = input.briefResultId
      ? await this.prisma.briefExtractionResult.findFirst({
          where: { id: input.briefResultId, workspaceId: job.workspaceId },
        })
      : null;
    if (!briefRow) {
      await this.transition(
        scope,
        job,
        "FAILED",
        { progressStage: "PREPARING_DRAFT" },
        "DRAFTING_BRIEF_MISSING",
      );
      return { status: "NOT_FOUND", message: "Izvučene činjenice ne postoje." };
    }
    const previous = input.previousDraftId
      ? await this.prisma.draftResult.findFirst({
          where: { id: input.previousDraftId, workspaceId: job.workspaceId },
        })
      : null;
    const note = input.reviewerNote?.trim()
      ? toLatin(input.reviewerNote)
      : null;
    const result = await this.produceDraft(
      scope,
      job,
      briefRow,
      previous,
      note,
    );
    if (result.status === "DRAFT_READY") {
      await this.announceDraft(scope, result.draftId);
    }
    return result;
  }

  /** Grounds and drafts on an existing `drafting` job, optionally revising. */
  private async produceDraft(
    scope: AssistantTurnScope,
    job: JobRecord,
    briefRow: { id: string; brief: unknown },
    previous: {
      id: string;
      documentText: string;
      finalDocumentText: string | null;
    } | null,
    note: string | null,
  ): Promise<DraftToolResult> {
    const { draftRevision } = createDraftingWorkflows({
      provider: resolveChatModelProvider(this.config, this.provider),
      search: (query, limit) => this.search(scope.workspaceId, query, limit),
    });
    try {
      const outcome = await runDraftingWorkflow(draftRevision, {
        brief: normalizeBrief(briefRow.brief),
        caseContext: await this.caseContext(scope),
        budget: this.budget(),
        feedback:
          previous || note
            ? {
                previousDraft: previous
                  ? (previous.finalDocumentText ?? previous.documentText)
                  : undefined,
                reviewerNote: note ?? undefined,
              }
            : null,
      });
      return await this.saveDraft(
        scope,
        job,
        briefRow.id,
        outcome,
        previous?.id ?? null,
      );
    } catch (error) {
      await this.failJobs(scope, error, [{ job, code: "DRAFTING_LLM_FAILED" }]);
      return { status: "FAILED", message: "Izrada nacrta nije uspela." };
    }
  }

  /** Assistant message for queued drafting jobs (no agent turn to summarize). */
  private async announceDraft(scope: AssistantTurnScope, draftId: string) {
    const message = await this.prisma.chatMessage.create({
      data: {
        sessionId: scope.sessionId,
        role: "ASSISTANT",
        content:
          scope.language === "en"
            ? "The draft is ready for review."
            : "Nacrt je spreman za pregled.",
        status: "COMPLETED",
        correlationId: scope.correlationId,
        metadata: { outcome: "DRAFT_READY", draftId },
      },
    });
    const mapped = toMessage({ ...message, attachments: [] });
    this.emit(scope, {
      type: "message.created",
      createdAt: mapped.createdAt,
      message: mapped,
    });
  }

  async getDraft(
    scope: AssistantTurnScope,
    args: { draftId?: string },
  ): Promise<DraftReadResult> {
    const draft = await this.findDraft(scope, args.draftId);
    if (!draft) {
      return {
        status: "NOT_FOUND",
        message: "U ovom razgovoru nema tog nacrta.",
      };
    }
    const citations = await this.prisma.draftCitation.findMany({
      where: { draftResultId: draft.id },
      orderBy: { marker: "asc" },
    });
    const text = draft.finalDocumentText ?? draft.documentText;
    return {
      status: "FOUND",
      draftId: draft.id,
      version: await this.versionOf(draft),
      approvalStatus: draft.approvalStatus,
      warnings: draft.warnings,
      citations: citations.map(({ marker, articleNumber, sourceTitle }) => ({
        marker,
        articleNumber,
        sourceTitle,
      })),
      text: text.slice(0, DRAFT_READ_MAX_CHARS),
      truncated: text.length > DRAFT_READ_MAX_CHARS,
    };
  }

  async listDrafts(
    scope: AssistantTurnScope,
  ): Promise<{ drafts: DraftListItem[] }> {
    return {
      drafts: await this.sessionDrafts(scope.workspaceId, scope.sessionId),
    };
  }

  /** Workspace-state block for the agent's context (AI_ARCHITECTURE.md §3). */
  async workspaceState(
    workspaceId: string,
    sessionId: string,
  ): Promise<string | null> {
    const drafts = (await this.sessionDrafts(workspaceId, sessionId)).slice(
      -WORKSPACE_STATE_DRAFTS,
    );
    if (!drafts.length) return null;
    return [
      "Nacrti u ovom razgovoru (najstariji prvi):",
      ...drafts.map(
        (draft) =>
          `- id ${draft.draftId}, v${draft.version}, status ${draft.approvalStatus}: „${draft.title}“`,
      ),
    ].join("\n");
  }

  private async sessionDrafts(
    workspaceId: string,
    sessionId: string,
  ): Promise<DraftListItem[]> {
    const rows: DraftRow[] = await this.prisma.draftResult.findMany({
      where: { workspaceId, sessionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        previousDraftId: true,
        approvalStatus: true,
        createdAt: true,
        documentText: true,
        finalDocumentText: true,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return rows.map((row) => ({
      draftId: row.id,
      version: chainLength(row, (id) => byId.get(id)),
      approvalStatus: row.approvalStatus,
      createdAt: row.createdAt.toISOString(),
      title: firstLine(toLatin(row.finalDocumentText ?? row.documentText)),
    }));
  }

  private async findDraft(scope: AssistantTurnScope, draftId?: string) {
    return this.prisma.draftResult.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        ...(draftId ? { id: draftId } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  private async versionOf(draft: {
    id: string;
    previousDraftId: string | null;
  }) {
    let version = 1;
    let previousId = draft.previousDraftId;
    const seen = new Set([draft.id]);
    while (previousId && !seen.has(previousId) && version < 100) {
      seen.add(previousId);
      const previous = await this.prisma.draftResult.findUnique({
        where: { id: previousId },
        select: { previousDraftId: true },
      });
      if (!previous) break;
      version += 1;
      previousId = previous.previousDraftId;
    }
    return version;
  }

  /** Client facts: the conversation's user messages and their attachments. */
  private async conversationInput(scope: AssistantTurnScope, note?: string) {
    const trigger = await this.prisma.chatMessage.findFirst({
      where: { id: scope.messageId, sessionId: scope.sessionId },
      select: { createdAt: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId: scope.sessionId,
        role: "USER",
        ...(trigger ? { createdAt: { lte: trigger.createdAt } } : {}),
      },
      include: { attachments: ATTACHMENT_WITH_ACCESS },
      orderBy: { createdAt: "desc" },
      take: CONVERSATION_USER_MESSAGES,
    });
    messages.reverse();
    const texts = messages
      .map((message) =>
        message.content === "(attachment)" ? "" : message.content,
      )
      .map((content) => toLatin(content).trim())
      .filter(Boolean);
    if (note?.trim())
      texts.push(`Napomena iz razgovora: ${toLatin(note.trim())}`);
    const attachments = messages
      .flatMap((message) => message.attachments)
      .filter((attachment) => attachment.workspaceId === scope.workspaceId)
      .slice(-CONVERSATION_ATTACHMENTS);
    return { userText: texts.join("\n\n"), attachments };
  }

  private async documentsByRef(
    scope: AssistantTurnScope,
    refs: string[],
  ): Promise<BriefDocumentInput[]> {
    if (!refs.length || !this.documentReads) return [];
    return this.documentReads.documentsByRef(scope, refs);
  }

  /** Reuses extracted text; extracts pending attachments like the legacy job. */
  private async readDocuments(
    scope: AssistantTurnScope,
    attachments: Array<AttachmentRow>,
  ): Promise<BriefDocumentInput[]> {
    const documents: BriefDocumentInput[] = [];
    for (const attachment of attachments) {
      const base = {
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
      };
      const access = DocumentAccessPolicy.forAttachment({
        contentId: attachment.contentId ?? null,
        document: attachment.document ?? null,
      });
      if (access.readable === false) {
        // No text source is touched for an attachment the policy refuses.
        const note = accessRefusalMessage(access, attachment.originalName);
        if (note) documents.push({ ...base, status: "FAILED", note });
        continue;
      }
      if (attachment.contentId && this.content) {
        const result = await this.readContent(
          scope,
          attachment,
          attachment.contentId,
        );
        documents.push({ ...base, status: result.status, text: result.text });
        continue;
      }
      if (
        attachment.extractionStatus === "COMPLETED" &&
        attachment.extractedText
      ) {
        documents.push({
          ...base,
          status: "COMPLETED",
          text: attachment.extractedText,
        });
        continue;
      }
      if (attachment.extractionStatus === "UNSUPPORTED") {
        documents.push({ ...base, status: "UNSUPPORTED" });
        continue;
      }
      const result = await this.extract(scope, attachment);
      documents.push({ ...base, status: result.status, text: result.text });
    }
    return documents;
  }

  /** Text of an attachment that shares a content row; extracted once per content. */
  private async readContent(
    scope: AssistantTurnScope,
    attachment: AttachmentRow,
    contentId: string,
  ): Promise<{
    status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
    text?: string;
  }> {
    const summary = toAttachmentSummary(attachment);
    this.emit(scope, {
      type: "attachment.updated",
      createdAt: new Date().toISOString(),
      attachment: { ...summary, extractionStatus: "RUNNING" },
    });
    const result = await this.content!.ensureText(
      attachment.workspaceId,
      contentId,
    ).catch((error: unknown) => {
      this.logger.warn(
        `Text of content ${contentId} was not read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: "FAILED" as const, text: null };
    });
    const status =
      result.status === "COMPLETED" || result.status === "UNSUPPORTED"
        ? result.status
        : "FAILED";
    this.emit(scope, {
      type: "attachment.updated",
      createdAt: new Date().toISOString(),
      attachment: { ...summary, extractionStatus: status },
    });
    return status === "COMPLETED"
      ? { status, text: result.text ?? "" }
      : { status };
  }

  private async extract(
    scope: AssistantTurnScope,
    attachment: AttachmentRow,
  ): Promise<{
    status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
    text?: string;
  }> {
    const summary = toAttachmentSummary(attachment);
    await this.prisma.chatAttachment.update({
      where: { id: attachment.id },
      data: { extractionStatus: "RUNNING" },
    });
    this.emit(scope, {
      type: "attachment.updated",
      createdAt: new Date().toISOString(),
      attachment: { ...summary, extractionStatus: "RUNNING" },
    });
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
      this.emit(scope, {
        type: "attachment.updated",
        createdAt: new Date().toISOString(),
        attachment: {
          ...summary,
          extractionStatus: result.status,
          sourceScript: result.sourceScript ?? null,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: "FAILED",
          extractionError:
            error instanceof Error ? error.message : "Extraction failed",
          extractedAt: new Date(),
        },
      });
      this.emit(scope, {
        type: "attachment.updated",
        createdAt: new Date().toISOString(),
        attachment: { ...summary, extractionStatus: "FAILED" },
      });
      return { status: "FAILED" };
    }
  }

  private async saveDraft(
    scope: AssistantTurnScope,
    job: JobRecord,
    briefResultId: string,
    outcome: DraftingOutcome,
    previousDraftId: string | null,
  ): Promise<DraftToolResult> {
    const draft = outcome.draft;
    await this.transition(scope, job, "RUNNING", {
      progressStage: "SAVING_FOR_REVIEW",
    });
    const sessionCaseId = await this.matterLink.sessionCaseId(
      scope.workspaceId,
      scope.sessionId,
    );
    const saved = await this.prisma.draftResult.create({
      data: {
        jobId: job.id,
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        caseId: sessionCaseId,
        messageId: scope.messageId || null,
        briefResultId,
        documentType: outcome.brief.documentType,
        documentText: draft.documentText,
        warnings: draft.warnings,
        promptChars: outcome.promptChars,
        truncated: outcome.truncated,
        model: this.config.openRouterModel,
        previousDraftId,
        citations: outcome.citations.length
          ? {
              create: outcome.citations.map((citation) => ({
                marker: citation.marker,
                chunkId: citation.chunkId,
                articleNumber: citation.articleNumber,
                sourceTitle: citation.sourceTitle,
                sourceUrl: citation.sourceUrl,
                snippet: citation.snippet,
                score: citation.score,
              })),
            }
          : undefined,
      },
      include: { citations: true },
    });
    const mapped = toDraft(saved);
    this.emit(scope, {
      type: "draft.updated",
      createdAt: mapped.updatedAt ?? mapped.createdAt,
      draft: mapped,
    });
    await this.transition(scope, job, "COMPLETED", {
      progressStage: "SAVING_FOR_REVIEW",
      draft: {
        id: saved.id,
        documentTextLength: draft.documentText.length,
        warnings: draft.warnings,
      },
    });
    return {
      status: "DRAFT_READY",
      draftId: saved.id,
      documentType: getDocumentType(outcome.brief.documentType).label,
      version: await this.versionOf(saved),
      approvalStatus: saved.approvalStatus,
      missingFields: outcome.brief.missingFields.map((field) => field.label),
      warnings: draft.warnings,
      citationCount: outcome.citations.length,
      excerpt: draft.documentText.slice(0, DRAFT_EXCERPT_CHARS),
    };
  }

  private async search(workspaceId: string, query: string, limit: number) {
    return this.legalKnowledge
      ? this.legalKnowledge.search(query, limit, workspaceId)
      : [];
  }

  private async caseContext(scope: AssistantTurnScope): Promise<string | null> {
    const block = await this.matterLink.caseContextBlock(
      scope.workspaceId,
      scope.sessionId,
    );
    return block ? toLatin(block) : null;
  }

  private budget() {
    return {
      perDocMaxChars: this.config.briefPerDocMaxChars,
      totalMaxChars: this.config.briefTotalMaxChars,
      draftingPromptMaxChars: this.config.draftingPromptMaxChars,
    };
  }

  private async createJob(
    scope: AssistantTurnScope,
    workflowName: "brief-extraction" | "drafting",
    input: Record<string, unknown>,
    progressStage: WorkflowProgressStage,
  ): Promise<JobRecord> {
    const now = new Date();
    const job = await this.prisma.workflowJob.create({
      data: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        workflowName,
        status: "RUNNING",
        correlationId: scope.correlationId,
        input: JSON.parse(JSON.stringify(input)),
        output: { progressStage },
        startedAt: now,
      },
    });
    this.emit(scope, {
      type: "job.queued",
      createdAt: job.createdAt.toISOString(),
      job: toJob(job),
    });
    return job;
  }

  private async transition(
    scope: AssistantTurnScope,
    job: JobRecord,
    status: WorkflowJobStatus,
    output: Record<string, unknown>,
    errorCode: string | null = null,
  ): Promise<void> {
    const terminal = status === "COMPLETED" || status === "FAILED";
    const updated = await this.prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status,
        errorCode,
        output: JSON.parse(JSON.stringify(output)),
        ...(terminal ? { finishedAt: new Date() } : {}),
      },
    });
    this.emit(scope, {
      type: "job.updated",
      createdAt: updated.updatedAt.toISOString(),
      job: toJob(updated),
    });
  }

  private async failJobs(
    scope: AssistantTurnScope,
    error: unknown,
    jobs: Array<{ job: JobRecord; code: string } | null>,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Assistant drafting failed (session ${scope.sessionId}, job ${scope.jobId}): ${message}`,
    );
    for (const entry of jobs) {
      if (!entry) continue;
      await this.transition(
        scope,
        entry.job,
        "FAILED",
        {
          progressStage:
            entry.job.workflowName === "drafting"
              ? "PREPARING_DRAFT"
              : "EXTRACTING_FACTS",
          error: message,
        },
        entry.code,
      ).catch(() => undefined);
    }
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

type AttachmentRow = {
  id: string;
  workspaceId: string;
  sessionId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  extractionStatus: ChatAttachmentSummary["extractionStatus"];
  extractedText: string | null;
  sourceScript: ChatAttachmentSummary["sourceScript"] | null;
  documentId?: string | null;
  contentId?: string | null;
  content?: { status: string } | null;
  /** The document the attachment was filed as; its AI access applies. */
  document?: { aiAccess: boolean; archivedAt: Date | null } | null;
};

function toAttachmentSummary(attachment: AttachmentRow): ChatAttachmentSummary {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    extractionStatus: attachment.extractionStatus,
    sourceScript: attachment.sourceScript ?? null,
    aiStatus: contentAiStatus(attachment.content),
  };
}

function firstLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((value) => value.trim())
      .find(Boolean) ?? "";
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

function chainLength(
  row: { id: string; previousDraftId: string | null },
  lookup: (
    id: string,
  ) => { id: string; previousDraftId: string | null } | undefined,
): number {
  let version = 1;
  let current = row;
  const seen = new Set([row.id]);
  while (current.previousDraftId && !seen.has(current.previousDraftId)) {
    const previous = lookup(current.previousDraftId);
    if (!previous) break;
    seen.add(previous.id);
    version += 1;
    current = previous;
  }
  return version;
}

/** Turn scope for a queued job; `messageId` may be empty for old rows. */
function scopeFromJob(
  job: {
    id: string;
    workspaceId: string;
    sessionId: string;
    correlationId: string;
  },
  input: { messageId?: string | null; language?: "sr" | "en" },
): AssistantTurnScope {
  return {
    workspaceId: job.workspaceId,
    sessionId: job.sessionId,
    jobId: job.id,
    correlationId: job.correlationId,
    messageId: input.messageId ?? "",
    language: input.language === "en" ? "en" : "sr",
    // Queued drafting jobs never call the office tools.
    userId: null,
    userDisplayName: null,
  };
}
