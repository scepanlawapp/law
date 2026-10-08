import { Injectable, Logger, Optional } from "@nestjs/common";
import type { BriefDocumentInput } from "@law/brief-extraction";
import { PlatformPrismaService } from "@law/core";
import { extractAttachmentText } from "@law/extraction";
import type {
  AssistantDocumentEntry,
  AssistantDocumentList,
  AssistantDocumentMatch,
  AssistantDocumentRead,
  AssistantDocumentSearch,
  AssistantTurnScope,
} from "@law/mastra";
import { toLatin } from "@law/transliteration";
import { DocumentTextService } from "@law/workspace-documents";
import { ChatAttachmentStorage } from "@law/file-storage";

const DOCUMENT_LIMIT = 30;
const READ_WINDOW_CHARS = 12_000;
const SNIPPET_CONTEXT_CHARS = 200;
const HITS_PER_DOCUMENT = 10;
const DOC_PREFIX = "doc:";
const ATTACHMENT_PREFIX = "att:";

type Source =
  | {
      kind: "document";
      ref: string;
      title: string;
      fileName: string;
      versionId: string;
      status: string;
      addedAt: Date;
    }
  | {
      kind: "attachment";
      ref: string;
      title: string;
      fileName: string;
      attachmentId: string;
      status: string;
      addedAt: Date;
    };

type SourceText = { status: string; text: string | null };

export interface TimelineDocumentInput {
  ref: string;
  title: string;
  status: "COMPLETED" | "FAILED" | "UNSUPPORTED";
  /** Latin script. */
  text?: string;
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
    @Optional() private readonly documentText?: DocumentTextService,
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
      const { status, text } = await this.textOf(scope, source);
      // The prompt shows "title (file name)".
      const base = {
        id: source.ref,
        name: source.title,
        mimeType: source.fileName,
      };
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
        })),
        skipped: named
          .slice(args.limit)
          .map((doc) => ({ ref: doc.id, title: doc.name })),
      };
    }
    const documents: TimelineDocumentInput[] = [];
    for (const source of sources.slice(0, args.limit)) {
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
    const needle = fold(toLatin(args.query)).text.trim();
    const unreadable: string[] = [];
    const matches: AssistantDocumentMatch[] = [];
    let searched = 0;
    for (const source of selected) {
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
      matches,
    };
  }

  private async sources(scope: AssistantTurnScope): Promise<{
    caseId: string | null;
    caseNumber: string | null;
    sources: Source[];
    truncated: boolean;
  }> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: scope.sessionId, workspaceId: scope.workspaceId },
      select: {
        case: { select: { id: true, caseNumber: true } },
      },
    });
    const caseId = session?.case?.id ?? null;
    const [documents, attachments] = await Promise.all([
      caseId
        ? this.prisma.document.findMany({
            where: {
              workspaceId: scope.workspaceId,
              archivedAt: null,
              cases: { some: { caseId } },
              currentVersionId: { not: null },
            },
            orderBy: { createdAt: "asc" },
            take: DOCUMENT_LIMIT + 1,
            select: {
              id: true,
              title: true,
              createdAt: true,
              currentVersion: {
                select: {
                  id: true,
                  originalFilename: true,
                  extractionStatus: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.chatAttachment.findMany({
        where: { workspaceId: scope.workspaceId, sessionId: scope.sessionId },
        orderBy: { createdAt: "asc" },
        take: DOCUMENT_LIMIT,
        select: {
          id: true,
          originalName: true,
          extractionStatus: true,
          documentId: true,
          createdAt: true,
        },
      }),
    ]);

    const sources: Source[] = [];
    const filed = new Set<string>();
    for (const document of documents.slice(0, DOCUMENT_LIMIT)) {
      if (!document.currentVersion) continue;
      filed.add(document.id);
      sources.push({
        kind: "document",
        ref: `${DOC_PREFIX}${document.id}`,
        title: toLatin(document.title),
        fileName: document.currentVersion.originalFilename,
        versionId: document.currentVersion.id,
        status: document.currentVersion.extractionStatus,
        addedAt: document.createdAt,
      });
    }
    for (const attachment of attachments) {
      if (attachment.documentId && filed.has(attachment.documentId)) continue;
      sources.push({
        kind: "attachment",
        ref: `${ATTACHMENT_PREFIX}${attachment.id}`,
        title: toLatin(attachment.originalName),
        fileName: attachment.originalName,
        attachmentId: attachment.id,
        status: attachment.extractionStatus,
        addedAt: attachment.createdAt,
      });
    }
    return {
      caseId,
      caseNumber: session?.case?.caseNumber ?? null,
      sources,
      truncated: documents.length > DOCUMENT_LIMIT,
    };
  }

  /** A non-archived workspace document named explicitly by its `doc:<id>` ref. */
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
      select: {
        id: true,
        title: true,
        createdAt: true,
        currentVersion: {
          select: { id: true, originalFilename: true, extractionStatus: true },
        },
      },
    });
    if (!document?.currentVersion) return null;
    return {
      kind: "document",
      ref: `${DOC_PREFIX}${document.id}`,
      title: toLatin(document.title),
      fileName: document.currentVersion.originalFilename,
      versionId: document.currentVersion.id,
      status: document.currentVersion.extractionStatus,
      addedAt: document.createdAt,
    };
  }

  private async textOf(
    scope: AssistantTurnScope,
    source: Source,
  ): Promise<SourceText> {
    if (source.kind === "document") {
      if (!this.documentText) return { status: "UNAVAILABLE", text: null };
      return this.documentText.ensureText(scope.workspaceId, source.versionId);
    }
    return this.attachmentText(scope.workspaceId, source.attachmentId);
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

function toEntry(source: Source): AssistantDocumentEntry {
  return {
    ref: source.ref,
    title: source.title,
    fileName: source.fileName,
    origin: source.kind === "document" ? "CASE" : "CHAT",
    textStatus:
      source.status === "COMPLETED"
        ? "READY"
        : source.status === "FAILED"
          ? "FAILED"
          : source.status === "UNSUPPORTED"
            ? "UNSUPPORTED"
            : "PENDING",
    addedAt: source.addedAt.toISOString().slice(0, 10),
  };
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
