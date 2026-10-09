import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  BriefDocumentFact,
  BriefDocumentInput,
} from "@law/brief-extraction";
import { PlatformPrismaService } from "@law/core";
import { extractAttachmentText } from "@law/extraction";
import type {
  AssistantCaseDocumentSearch,
  AssistantDocumentEntry,
  AssistantDocumentFacts,
  AssistantDocumentList,
  AssistantDocumentMatch,
  AssistantDocumentRead,
  AssistantDocumentSearch,
  AssistantDocumentSubject,
  AssistantTurnScope,
} from "@law/mastra";
import type { DocumentKind } from "@law/api-interfaces";
import { toLatin } from "@law/transliteration";
import {
  DocumentContentSearch,
  DocumentContentService,
} from "@law/document-ingestion";
import { ChatAttachmentStorage } from "@law/file-storage";
import {
  type AccessDecision,
  DocumentAccessPolicy,
  accessRefusalMessage,
} from "./document-access.policy";
import {
  type SourcedFact,
  findFactConflicts,
} from "./document-facts.conflicts";

const DOCUMENT_LIMIT = 30;
/** Readable case documents the content tools cover (newest first). */
const READABLE_DOCUMENT_LIMIT = 100;
/** Unfiled chat attachments the content tools cover (newest first). */
const READABLE_ATTACHMENT_LIMIT = 30;
/** Facts one get_document_facts result holds. */
const FACTS_RESULT_LIMIT = 300;
const READ_WINDOW_CHARS = 12_000;
const SNIPPET_CONTEXT_CHARS = 200;
const HITS_PER_DOCUMENT = 10;
const CASE_SEARCH_DEFAULT_LIMIT = 8;
const CASE_SEARCH_MAX_LIMIT = 12;
const DOC_PREFIX = "doc:";
const ATTACHMENT_PREFIX = "att:";

const CASE_SEARCH_UNAVAILABLE = {
  status: "UNAVAILABLE" as const,
  message: "Pretraga sadržaja dokumenata trenutno nije dostupna.",
};
const FACTS_UNAVAILABLE = {
  status: "UNAVAILABLE" as const,
  message: "Podaci iz dokumenata trenutno nisu dostupni.",
};

type SourceBase = {
  ref: string;
  title: string;
  fileName: string;
  status: string;
  /** Pipeline status of the shared content; null when there is no content row (legacy `status` applies). */
  contentStatus: string | null;
  addedAt: Date;
  /** Null for data created before ingestion (legacy text columns apply). */
  contentId: string | null;
  /** Decided before any text is read; `readable: false` sources never reach a text source. */
  access: AccessDecision;
};

type Source =
  | (SourceBase & { kind: "document"; versionId: string })
  | (SourceBase & { kind: "attachment"; attachmentId: string });

type SourceText = { status: string; text: string | null };

export interface TimelineDocumentInput {
  ref: string;
  title: string;
  status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
  /** Latin script. */
  text?: string;
  /** Why there is no text, when the user should hear it (AI access off). */
  note?: string;
}

/**
 * Read-only document text for the assistant: this conversation's attachments
 * that are not filed yet plus the non-archived documents of the conversation's
 * case. A workspace document the user names by its `doc:<id>` ref (for example
 * from the starter-card picker) can also be read and searched. Text is
 * extracted lazily and stored; every query is workspace-scoped.
 */
@Injectable()
export class AssistantDocumentReadsService {
  private readonly logger = new Logger(AssistantDocumentReadsService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: ChatAttachmentStorage,
    @Optional()
    @Inject(DocumentContentService)
    private readonly content?: DocumentContentService,
    @Optional()
    @Inject(DocumentContentSearch)
    private readonly contentSearch?: DocumentContentSearch,
  ) {}

  async listDocuments(
    scope: AssistantTurnScope,
  ): Promise<AssistantDocumentList> {
    const { caseNumber, sources, truncated } = await this.sources(scope);
    return {
      status: "OK",
      case: caseNumber,
      items: sources.map(toEntry),
      truncated,
    };
  }

  async readDocument(
    scope: AssistantTurnScope,
    args: { ref: string; offset?: number },
  ): Promise<AssistantDocumentRead> {
    const { sources } = await this.sources(scope);
    const ref = args.ref.trim();
    const source =
      sources.find((item) => item.ref === ref) ??
      (await this.namedDocument(scope, ref));
    if (!source) {
      return {
        status: "NOT_FOUND",
        message: `Dokument "${args.ref}" nije pronađen. Koristite list_documents.`,
      };
    }
    const refusal = refuse(source, args.ref);
    if (refusal) return refusal;
    const { status, text } = await this.textOf(scope, source);
    if (text === null) {
      return {
        status: status === "UNAVAILABLE" ? "UNAVAILABLE" : "NO_TEXT",
        message: noTextMessage(source.title, status),
      };
    }
    const offset = Math.min(Math.max(args.offset ?? 0, 0), text.length);
    const end = Math.min(offset + READ_WINDOW_CHARS, text.length);
    return {
      status: "OK",
      ref: source.ref,
      title: source.title,
      offset,
      nextOffset: end < text.length ? end : null,
      totalChars: text.length,
      text: text.slice(offset, end),
    };
  }

  /**
   * Full text of documents named by ref (`doc:` or `att:`) for drafting.
   * Unknown refs are skipped; documents without text report their status.
   */
  async documentsByRef(
    scope: AssistantTurnScope,
    refs: string[],
  ): Promise<BriefDocumentInput[]> {
    const wanted = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
    if (!wanted.length) return [];
    const { sources } = await this.sources(scope);
    const documents: BriefDocumentInput[] = [];
    for (const ref of wanted) {
      const source =
        sources.find((item) => item.ref === ref) ??
        (await this.namedDocument(scope, ref));
      if (!source) continue;
      // The prompt shows "title (file name)".
      const base = {
        id: source.ref,
        name: source.title,
        mimeType: source.fileName,
      };
      if (!source.access.readable) {
        const note = accessRefusalMessage(source.access, source.title);
        if (!note) continue;
        documents.push({ ...base, status: "FAILED", note });
        continue;
      }
      const { status, text } = await this.textOf(scope, source);
      if (text !== null && text.trim()) {
        documents.push({ ...base, status: "COMPLETED", text: toLatin(text) });
      } else {
        documents.push({
          ...base,
          status: status === "UNSUPPORTED" ? "UNSUPPORTED" : "FAILED",
        });
      }
    }
    return documents;
  }

  /**
   * Documents for a case timeline: the named refs, or every readable source of
   * the conversation (case documents and unfiled attachments), oldest first.
   * Beyond `limit` documents are returned as skipped, without reading them.
   */
  async documentsForTimeline(
    scope: AssistantTurnScope,
    args: { refs?: string[]; limit: number },
  ): Promise<{
    caseId: string | null;
    caseNumber: string | null;
    documents: TimelineDocumentInput[];
    skipped: Array<{ ref: string; title: string }>;
  }> {
    const { caseId, caseNumber, sources } = await this.sources(scope);
    if (args.refs?.length) {
      const named = await this.documentsByRef(scope, args.refs);
      return {
        caseId,
        caseNumber,
        documents: named.slice(0, args.limit).map((doc) => ({
          ref: doc.id,
          title: doc.name,
          status: doc.status,
          text: doc.text,
          ...(doc.note ? { note: doc.note } : {}),
        })),
        skipped: named
          .slice(args.limit)
          .map((doc) => ({ ref: doc.id, title: doc.name })),
      };
    }
    const documents: TimelineDocumentInput[] = [];
    for (const source of sources.slice(0, args.limit)) {
      if (!source.access.readable) {
        documents.push({
          ref: source.ref,
          title: source.title,
          status: "FAILED",
          note: accessRefusalMessage(source.access, source.title) ?? undefined,
        });
        continue;
      }
      const { status, text } = await this.textOf(scope, source);
      documents.push(
        text !== null && text.trim()
          ? {
              ref: source.ref,
              title: source.title,
              status: "COMPLETED",
              text: toLatin(text),
            }
          : {
              ref: source.ref,
              title: source.title,
              status: status === "UNSUPPORTED" ? "UNSUPPORTED" : "FAILED",
            },
      );
    }
    return {
      caseId,
      caseNumber,
      documents,
      skipped: sources
        .slice(args.limit)
        .map((source) => ({ ref: source.ref, title: source.title })),
    };
  }

  async searchDocuments(
    scope: AssistantTurnScope,
    args: { query: string; ref?: string },
  ): Promise<AssistantDocumentSearch> {
    const { sources } = await this.sources(scope);
    const ref = args.ref?.trim();
    let selected = ref ? sources.filter((item) => item.ref === ref) : sources;
    if (ref && !selected.length) {
      const named = await this.namedDocument(scope, ref);
      if (named) selected = [named];
    }
    if (!selected.length) {
      return {
        status: "NOT_FOUND",
        message: args.ref
          ? `Dokument "${args.ref}" nije pronađen. Koristite list_documents.`
          : "Nema dokumenata u razgovoru ni na povezanom predmetu.",
      };
    }
    if (ref && selected.length === 1 && !selected[0].access.readable) {
      const refusal = refuse(selected[0], args.ref ?? ref);
      if (refusal) {
        return {
          status:
            refusal.status === "AI_ACCESS_OFF" ? "AI_ACCESS_OFF" : "NOT_FOUND",
          message: refusal.message,
        };
      }
    }
    const needle = fold(toLatin(args.query)).text.trim();
    const unreadable: string[] = [];
    const aiAccessOff: string[] = [];
    const matches: AssistantDocumentMatch[] = [];
    let searched = 0;
    for (const source of selected) {
      if (!source.access.readable) {
        aiAccessOff.push(source.title);
        continue;
      }
      const { text } = await this.textOf(scope, source);
      if (text === null) {
        unreadable.push(source.title);
        continue;
      }
      searched += 1;
      const match = findMatches(source, text, needle);
      if (match) matches.push(match);
    }
    return {
      status: "OK",
      query: args.query,
      searched,
      unreadable,
      aiAccessOff,
      matches,
    };
  }

  /**
   * Semantic search over the chunks of the readable, indexed sources. The
   * content ids come only from sources the access policy allows; the search
   * layer never sees an off document.
   */
  async searchCaseDocuments(
    scope: AssistantTurnScope,
    args: { query: string; ref?: string; limit?: number },
  ): Promise<AssistantCaseDocumentSearch> {
    const selection = await this.selectSources(scope, args.ref);
    if ("refusal" in selection) return selection.refusal;
    if (!selection.sources.length) {
      return {
        status: "NO_DOCUMENTS",
        message: "Nema dokumenata u razgovoru ni na povezanom predmetu.",
      };
    }
    if (!this.contentSearch) return CASE_SEARCH_UNAVAILABLE;
    const { indexed, notIndexed, aiAccessOff } = await this.indexedSources(
      scope,
      selection.sources,
    );
    const limit = Math.min(
      Math.max(Math.trunc(args.limit ?? CASE_SEARCH_DEFAULT_LIMIT) || 1, 1),
      CASE_SEARCH_MAX_LIMIT,
    );
    let chunks: Awaited<ReturnType<DocumentContentSearch["searchChunks"]>> = [];
    if (indexed.size) {
      try {
        chunks = await this.contentSearch.searchChunks(
          scope.workspaceId,
          [...indexed.keys()],
          args.query,
          limit,
        );
      } catch (error) {
        this.logger.warn(
          `Semantic document search failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return CASE_SEARCH_UNAVAILABLE;
      }
    }
    const hits: Extract<AssistantCaseDocumentSearch, { status: "OK" }>["hits"] =
      [];
    for (const chunk of chunks) {
      const entry = indexed.get(chunk.contentId);
      if (!entry) continue;
      hits.push({
        n: hits.length + 1,
        ref: entry.source.ref,
        title: entry.source.title,
        text: chunk.text,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        score: chunk.score,
      });
    }
    return {
      status: "OK",
      query: args.query,
      hits,
      notIndexed,
      aiAccessOff,
      truncated: selection.truncated,
    };
  }

  /**
   * Extracted facts of the readable, processed sources, grouped by subject,
   * plus the values two documents report differently for one person or
   * company. Facts of a document with AI access off are never loaded.
   */
  async getDocumentFacts(
    scope: AssistantTurnScope,
    args: { ref?: string },
  ): Promise<AssistantDocumentFacts> {
    const selection = await this.selectSources(scope, args.ref);
    if ("refusal" in selection) return selection.refusal;
    if (!this.contentSearch) return FACTS_UNAVAILABLE;
    const { indexed, notIndexed, aiAccessOff } = await this.indexedSources(
      scope,
      selection.sources,
    );
    let rows: Awaited<ReturnType<DocumentContentSearch["factsFor"]>> = [];
    if (indexed.size) {
      try {
        rows = await this.contentSearch.factsFor(scope.workspaceId, [
          ...indexed.keys(),
        ]);
      } catch (error) {
        this.logger.warn(
          `Document facts were not read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return FACTS_UNAVAILABLE;
      }
    }
    const order = [...indexed.keys()];
    const readableRows = rows
      .filter((row) => indexed.has(row.contentId))
      .sort((a, b) => order.indexOf(a.contentId) - order.indexOf(b.contentId));
    const ordered = readableRows.slice(0, FACTS_RESULT_LIMIT);
    const subjects = new Map<string, AssistantDocumentSubject>();
    const sourced: SourcedFact[] = [];
    for (const row of ordered) {
      const entry = indexed.get(row.contentId);
      if (!entry) continue;
      const key = `${row.contentId}\u0000${row.subjectKey}`;
      let subject = subjects.get(key);
      if (!subject) {
        subject = {
          ref: entry.source.ref,
          title: entry.source.title,
          documentKind: entry.documentKind ?? "OTHER",
          subjectKey: row.subjectKey,
          subjectType: row.subjectType,
          subjectRole: row.subjectRole,
          facts: [],
        };
        subjects.set(key, subject);
      }
      subject.facts.push({
        field: row.field,
        value: row.value,
        quote: row.quote,
        confidence: row.confidence,
      });
      sourced.push({
        ref: entry.source.ref,
        contentId: row.contentId,
        subjectKey: row.subjectKey,
        subjectType: row.subjectType,
        field: row.field,
        value: row.value,
        normalizedValue: row.normalizedValue,
      });
    }
    return {
      status: "OK",
      subjects: [...subjects.values()],
      conflicts: findFactConflicts(sourced),
      notIndexed,
      aiAccessOff,
      truncated:
        selection.truncated || readableRows.length > FACTS_RESULT_LIMIT,
    };
  }

  /**
   * Facts for a drafting brief: the readable sources' facts (named refs first),
   * flattened to values without quotes. It goes through `getDocumentFacts`, so
   * a document with AI access off contributes nothing.
   */
  async briefDocumentFacts(
    scope: AssistantTurnScope,
    refs: string[],
  ): Promise<BriefDocumentFact[]> {
    const named = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
    const seen = new Set<string>();
    const facts: BriefDocumentFact[] = [];
    for (const args of [...named.map((ref) => ({ ref })), {}]) {
      const result = await this.getDocumentFacts(scope, args);
      if (result.status !== "OK") continue;
      for (const subject of result.subjects) {
        for (const fact of subject.facts) {
          const key = [
            subject.ref,
            subject.subjectKey,
            fact.field,
            fact.value,
          ].join("\u0000");
          if (seen.has(key)) continue;
          seen.add(key);
          facts.push({
            ref: subject.ref,
            title: subject.title,
            subjectType: subject.subjectType,
            subjectRole: subject.subjectRole,
            field: fact.field,
            value: fact.value,
          });
        }
      }
    }
    return facts;
  }

  /**
   * The sources a tool call covers: all of the conversation's, or the one named
   * by `ref`. A named source that is off or absent yields the refusal to return.
   */
  private async selectSources(
    scope: AssistantTurnScope,
    refArg: string | undefined,
  ): Promise<
    | { sources: Source[]; truncated: boolean }
    | {
        refusal: {
          status: "AI_ACCESS_OFF" | "NOT_FOUND";
          message: string;
        };
      }
  > {
    const { sources, truncated } = await this.readableSources(scope);
    const ref = refArg?.trim();
    if (!ref) return { sources, truncated };
    const source =
      sources.find((item) => item.ref === ref) ??
      (await this.namedDocument(scope, ref));
    if (!source) {
      return {
        refusal: {
          status: "NOT_FOUND",
          message: `Dokument "${refArg}" nije pronađen. Koristite list_documents.`,
        },
      };
    }
    const refusal = refuse(source, ref);
    return refusal ? { refusal } : { sources: [source], truncated: false };
  }

  /**
   * Splits sources by what the assistant may use: readable sources whose
   * content is processed (READY) are returned by content id; readable but
   * unprocessed ones are `notIndexed`; documents with AI access off are
   * `aiAccessOff`. Only readable sources ever contribute a content id.
   */
  private async indexedSources(
    scope: AssistantTurnScope,
    sources: Source[],
  ): Promise<{
    indexed: Map<string, { source: Source; documentKind: DocumentKind | null }>;
    notIndexed: string[];
    aiAccessOff: string[];
  }> {
    const aiAccessOff: string[] = [];
    const readable: Source[] = [];
    for (const source of sources) {
      if (source.access.readable) readable.push(source);
      else aiAccessOff.push(source.title);
    }
    const contentIds = [
      ...new Set(
        readable
          .map((source) => source.contentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const contents = contentIds.length
      ? await this.prisma.documentContent.findMany({
          where: { workspaceId: scope.workspaceId, id: { in: contentIds } },
          select: { id: true, status: true, documentKind: true },
        })
      : [];
    const byId = new Map(contents.map((content) => [content.id, content]));
    const indexed = new Map<
      string,
      { source: Source; documentKind: DocumentKind | null }
    >();
    const notIndexed: string[] = [];
    for (const source of readable) {
      const content = source.contentId ? byId.get(source.contentId) : null;
      if (!source.contentId || content?.status !== "READY") {
        notIndexed.push(source.title);
        continue;
      }
      if (!indexed.has(source.contentId)) {
        indexed.set(source.contentId, {
          source,
          documentKind: content.documentKind,
        });
      }
    }
    return { indexed, notIndexed, aiAccessOff };
  }

  /**
   * Every source of the conversation for listing and reading: the oldest
   * `DOCUMENT_LIMIT` case documents and attachments, off ones included.
   */
  private async sources(scope: AssistantTurnScope): Promise<SourceSet> {
    const session = await this.sessionCase(scope);
    const caseId = session?.case?.id ?? null;
    const [documents, attachments] = await Promise.all([
      caseId
        ? this.prisma.document.findMany({
            where: caseDocumentWhere(scope, caseId),
            orderBy: { createdAt: "asc" },
            take: DOCUMENT_LIMIT + 1,
            select: SOURCE_DOCUMENT_SELECT,
          })
        : Promise.resolve([]),
      this.prisma.chatAttachment.findMany({
        where: { workspaceId: scope.workspaceId, sessionId: scope.sessionId },
        orderBy: { createdAt: "asc" },
        take: DOCUMENT_LIMIT,
        select: SOURCE_ATTACHMENT_SELECT,
      }),
    ]);
    return {
      caseId,
      caseNumber: session?.case?.caseNumber ?? null,
      sources: toSources(documents.slice(0, DOCUMENT_LIMIT), attachments),
      truncated: documents.length > DOCUMENT_LIMIT,
    };
  }

  /**
   * The sources the content tools (semantic search, facts) cover. Readable
   * sources are selected directly, so documents with AI access off never take
   * a slot from a newer readable one: the newest `READABLE_DOCUMENT_LIMIT`
   * case documents with AI access on plus the newest unfiled attachments.
   * A bounded sample of the off documents is added only so their titles can be
   * reported as `aiAccessOff`.
   */
  private async readableSources(scope: AssistantTurnScope): Promise<SourceSet> {
    const session = await this.sessionCase(scope);
    const caseId = session?.case?.id ?? null;
    const [documents, offDocuments] = caseId
      ? await Promise.all([
          this.prisma.document.findMany({
            where: { ...caseDocumentWhere(scope, caseId), aiAccess: true },
            orderBy: { createdAt: "desc" },
            take: READABLE_DOCUMENT_LIMIT + 1,
            select: SOURCE_DOCUMENT_SELECT,
          }),
          this.prisma.document.findMany({
            where: { ...caseDocumentWhere(scope, caseId), aiAccess: false },
            orderBy: { createdAt: "desc" },
            take: DOCUMENT_LIMIT,
            select: SOURCE_DOCUMENT_SELECT,
          }),
        ])
      : [[], []];
    const kept = documents.slice(0, READABLE_DOCUMENT_LIMIT);
    const attachments = await this.prisma.chatAttachment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        // Filed attachments follow their document; the case documents above
        // already cover those, so only unfiled ones and ones filed elsewhere.
        OR: [
          { documentId: null },
          {
            documentId: { notIn: kept.map((document) => document.id) },
            document: { aiAccess: true, archivedAt: null },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: READABLE_ATTACHMENT_LIMIT + 1,
      select: SOURCE_ATTACHMENT_SELECT,
    });
    return {
      caseId,
      caseNumber: session?.case?.caseNumber ?? null,
      sources: toSources(
        [...kept, ...offDocuments],
        attachments.slice(0, READABLE_ATTACHMENT_LIMIT),
      ),
      truncated:
        documents.length > READABLE_DOCUMENT_LIMIT ||
        attachments.length > READABLE_ATTACHMENT_LIMIT,
    };
  }

  private sessionCase(scope: AssistantTurnScope) {
    return this.prisma.chatSession.findFirst({
      where: { id: scope.sessionId, workspaceId: scope.workspaceId },
      select: {
        case: { select: { id: true, caseNumber: true } },
      },
    });
  }

  /**
   * A non-archived workspace document named explicitly by its `doc:<id>` ref.
   * One with AI access off is returned so the caller can refuse it by name.
   */
  private async namedDocument(
    scope: AssistantTurnScope,
    ref: string,
  ): Promise<Source | null> {
    if (!ref.startsWith(DOC_PREFIX)) return null;
    const document = await this.prisma.document.findFirst({
      where: {
        id: ref.slice(DOC_PREFIX.length),
        workspaceId: scope.workspaceId,
        archivedAt: null,
        currentVersionId: { not: null },
      },
      select: SOURCE_DOCUMENT_SELECT,
    });
    return document ? (toSources([document], [])[0] ?? null) : null;
  }

  /**
   * Text of a readable source. The caller has checked `source.access`; this
   * refuses again so a missed check cannot leak text.
   */
  private async textOf(
    scope: AssistantTurnScope,
    source: Source,
  ): Promise<SourceText> {
    if (!source.access.readable) return { status: "UNAVAILABLE", text: null };
    if (source.contentId) {
      if (!this.content) return { status: "UNAVAILABLE", text: null };
      try {
        return await this.content.ensureText(
          scope.workspaceId,
          source.contentId,
        );
      } catch (error) {
        this.logger.warn(
          `Text of content ${source.contentId} was not read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { status: "FAILED", text: null };
      }
    }
    // Created before ingestion and not backfilled yet: the legacy columns.
    if (source.kind === "document") {
      return this.legacyVersionText(scope.workspaceId, source.versionId);
    }
    return this.attachmentText(scope.workspaceId, source.attachmentId);
  }

  private async legacyVersionText(
    workspaceId: string,
    versionId: string,
  ): Promise<SourceText> {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, workspaceId },
      select: { extractionStatus: true, extractedText: true },
    });
    if (!version) return { status: "UNAVAILABLE", text: null };
    if (version.extractionStatus === "COMPLETED") {
      return { status: "COMPLETED", text: version.extractedText ?? "" };
    }
    if (version.extractionStatus === "UNSUPPORTED") {
      return { status: "UNSUPPORTED", text: null };
    }
    return { status: "UNAVAILABLE", text: null };
  }

  /** Reuses the chat extraction; extracts and stores it when still pending. */
  private async attachmentText(
    workspaceId: string,
    attachmentId: string,
  ): Promise<SourceText> {
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: { id: attachmentId, workspaceId },
    });
    if (!attachment) return { status: "UNAVAILABLE", text: null };
    if (attachment.extractionStatus === "COMPLETED") {
      return { status: "COMPLETED", text: attachment.extractedText ?? "" };
    }
    if (attachment.extractionStatus === "UNSUPPORTED") {
      return { status: "UNSUPPORTED", text: null };
    }
    try {
      const buffer = await this.storage.read({
        workspaceId,
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
      return {
        status: result.status,
        text: result.status === "COMPLETED" ? (result.text ?? "") : null,
      };
    } catch (error) {
      this.logger.warn(
        `Attachment text unavailable: ${error instanceof Error ? error.message : error}`,
      );
      return { status: "FAILED", text: null };
    }
  }
}

type SourceSet = {
  caseId: string | null;
  caseNumber: string | null;
  sources: Source[];
  truncated: boolean;
};

function caseDocumentWhere(scope: AssistantTurnScope, caseId: string) {
  return {
    workspaceId: scope.workspaceId,
    archivedAt: null,
    cases: { some: { caseId } },
    currentVersionId: { not: null },
  };
}

const SOURCE_DOCUMENT_SELECT = {
  id: true,
  title: true,
  createdAt: true,
  aiAccess: true,
  archivedAt: true,
  currentVersion: {
    select: {
      id: true,
      originalFilename: true,
      extractionStatus: true,
      contentId: true,
      content: { select: { status: true } },
    },
  },
} as const;

const SOURCE_ATTACHMENT_SELECT = {
  id: true,
  originalName: true,
  extractionStatus: true,
  documentId: true,
  contentId: true,
  content: { select: { status: true } },
  createdAt: true,
  document: { select: { aiAccess: true, archivedAt: true } },
} as const;

type SourceDocumentRow = Prisma.DocumentGetPayload<{
  select: typeof SOURCE_DOCUMENT_SELECT;
}>;
type SourceAttachmentRow = Prisma.ChatAttachmentGetPayload<{
  select: typeof SOURCE_ATTACHMENT_SELECT;
}>;

/** Documents first, then attachments not already covered by a filed document. */
function toSources(
  documents: SourceDocumentRow[],
  attachments: SourceAttachmentRow[],
): Source[] {
  const sources: Source[] = [];
  const filed = new Set<string>();
  for (const document of documents) {
    if (!document.currentVersion) continue;
    filed.add(document.id);
    const access = DocumentAccessPolicy.forDocument(document);
    if (hiddenFromAssistant(access)) continue;
    sources.push({
      kind: "document",
      ref: `${DOC_PREFIX}${document.id}`,
      title: toLatin(document.title),
      fileName: document.currentVersion.originalFilename,
      versionId: document.currentVersion.id,
      status: document.currentVersion.extractionStatus,
      contentStatus: document.currentVersion.content?.status ?? null,
      addedAt: document.createdAt,
      contentId: document.currentVersion.contentId,
      access,
    });
  }
  for (const attachment of attachments) {
    if (attachment.documentId && filed.has(attachment.documentId)) continue;
    const access = DocumentAccessPolicy.forAttachment({
      contentId: attachment.contentId,
      document: attachment.document,
    });
    // An attachment filed as an archived document is gone for the assistant.
    if (hiddenFromAssistant(access)) continue;
    sources.push({
      kind: "attachment",
      ref: `${ATTACHMENT_PREFIX}${attachment.id}`,
      title: toLatin(attachment.originalName),
      fileName: attachment.originalName,
      attachmentId: attachment.id,
      status: attachment.extractionStatus,
      contentStatus: attachment.content?.status ?? null,
      addedAt: attachment.createdAt,
      contentId: attachment.contentId,
      access,
    });
  }
  return sources;
}

/** Archived or unknown: the assistant does not see these at all. */
function hiddenFromAssistant(access: AccessDecision): boolean {
  return access.readable === false && access.reason !== "AI_ACCESS_OFF";
}

/** The tool answer for a source the assistant may not read, or null when readable. */
function refuse(
  source: Source,
  ref: string,
): { status: "AI_ACCESS_OFF" | "NOT_FOUND"; message: string } | null {
  if (source.access.readable) return null;
  const message = accessRefusalMessage(source.access, source.title);
  return message
    ? { status: "AI_ACCESS_OFF", message }
    : {
        status: "NOT_FOUND",
        message: `Dokument "${ref}" nije pronađen. Koristite list_documents.`,
      };
}

function toEntry(source: Source): AssistantDocumentEntry {
  return {
    ref: source.ref,
    title: source.title,
    fileName: source.fileName,
    origin: source.kind === "document" ? "CASE" : "CHAT",
    textStatus: textStatusOf(source),
    aiAccess: source.access.readable ? "on" : "off",
    addedAt: source.addedAt.toISOString().slice(0, 10),
  };
}

/**
 * Content status wins when the source has a content row (it is the pipeline's
 * truth); the legacy per-source extraction column covers data from before
 * ingestion existed.
 */
function textStatusOf(source: Source): AssistantDocumentEntry["textStatus"] {
  if (source.contentStatus !== null) {
    switch (source.contentStatus) {
      case "READY":
      case "FAILED":
      case "UNSUPPORTED":
        return source.contentStatus;
      default:
        return "PENDING";
    }
  }
  switch (source.status) {
    case "COMPLETED":
      return "READY";
    case "FAILED":
    case "UNSUPPORTED":
      return source.status;
    default:
      return "PENDING";
  }
}

function noTextMessage(title: string, status: string): string {
  if (status === "UNSUPPORTED") {
    return `Tekst dokumenta "${title}" ne može da se pročita (nepodržan format).`;
  }
  if (status === "UNAVAILABLE") {
    return `Dokument "${title}" trenutno nije dostupan.`;
  }
  return `Tekst dokumenta "${title}" nije mogao da se izvuče.`;
}

function findMatches(
  source: Source,
  text: string,
  needle: string,
): AssistantDocumentMatch | null {
  if (!needle) return null;
  const folded = fold(text);
  const hits: AssistantDocumentMatch["hits"] = [];
  let count = 0;
  let position = folded.text.indexOf(needle);
  while (position !== -1) {
    count += 1;
    if (hits.length < HITS_PER_DOCUMENT) {
      const start = folded.origin[position];
      const end = folded.origin[position + needle.length - 1] + 1;
      hits.push({ offset: start, snippet: snippet(text, start, end) });
    }
    position = folded.text.indexOf(needle, position + needle.length);
  }
  return count ? { ref: source.ref, title: source.title, count, hits } : null;
}

function snippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - SNIPPET_CONTEXT_CHARS);
  const to = Math.min(text.length, end + SNIPPET_CONTEXT_CHARS);
  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

/**
 * Lower-case, diacritic-free text with whitespace runs collapsed, plus the
 * original index of every folded character (for offsets and snippets). Stored
 * text is already Latin; queries go through `toLatin` first.
 */
export function fold(latin: string): { text: string; origin: number[] } {
  let text = "";
  const origin: number[] = [];
  let lastWasSpace = false;
  for (let index = 0; index < latin.length; index += 1) {
    const char = latin[index];
    if (/\s/.test(char)) {
      if (!lastWasSpace && text.length) {
        text += " ";
        origin.push(index);
      }
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    const plain =
      char
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace("đ", "d")[0] ?? char;
    text += plain;
    origin.push(index);
  }
  return { text, origin };
}
