import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import {
  chunkText,
  classifyDocument,
  extractFacts,
  isFactKind,
  type ExtractedFact,
} from "@law/document-intelligence";
import {
  assertEmbeddingDimensions,
  type EmbeddingProvider,
} from "@law/knowledge";
import type { ChatModelProvider } from "@law/llm";
import { Prisma, type DocumentContentStatus } from "@prisma/client";
import { DocumentContentEvents } from "./document-content.events";
import { DocumentContentService } from "./document-content.service";
import { DocumentIngestionConfig } from "./document-ingestion.config";
import {
  DOCUMENT_EMBEDDING_PROVIDER,
  DOCUMENT_MODEL_PROVIDER,
} from "./document-ingestion.providers";
import {
  CURRENT_PIPELINE_VERSION,
  isIngestionCurrent,
} from "./document-ingestion.types";

const EMBED_BATCH_SIZE = 32;
const CHUNK_TRANSACTION_TIMEOUT_MS = 60_000;

interface ContentState {
  status: DocumentContentStatus;
  pipelineVersion: number;
  extractedText: string | null;
  documentKind: string | null;
  failedStep: string | null;
  embeddingModel: string | null;
}

/** A classification or fact step that failed on an otherwise READY content. */
interface StepFailure {
  step: "CLASSIFYING" | "FACTS";
  message: string;
}

/**
 * Resumable ingestion of one `DocumentContent`: extract, chunk and embed,
 * classify, extract facts. Each step persists its status before the work and
 * its results after; a retry skips every step whose result is already stored.
 * Every query filters by workspaceId.
 */
@Injectable()
export class DocumentIngestionPipeline {
  private readonly logger = new Logger(DocumentIngestionPipeline.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly contents: DocumentContentService,
    @Inject(DOCUMENT_EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
    @Inject(DOCUMENT_MODEL_PROVIDER)
    private readonly models: ChatModelProvider,
    private readonly config: DocumentIngestionConfig,
    private readonly events: DocumentContentEvents,
  ) {}

  async run(workspaceId: string, contentId: string): Promise<void> {
    let state = await this.load(workspaceId, contentId);
    if (!state) return;
    if (state.status === "UNSUPPORTED") return;
    // READY on another embedding model falls through: embedStep replaces the
    // old model's chunks and everything else stored is kept.
    if (isIngestionCurrent(state, this.embeddings.model)) return;
    // Off is strict: never send the text of unreadable content to a provider.
    if (!(await this.hasReadableSource(workspaceId, contentId))) {
      this.logger.log(
        `Content ${contentId} is not referenced by an AI-readable source; ingestion skipped`,
      );
      return;
    }
    if (
      state.status === "READY" &&
      state.pipelineVersion < CURRENT_PIPELINE_VERSION
    ) {
      // READY on an older pipeline: keep the text, redo everything derived.
      await this.resetDerived(workspaceId, contentId);
      state = { ...state, documentKind: null };
    }

    const text = await this.extractStep(workspaceId, contentId, state);
    if (text === null) return; // unsupported; already recorded and emitted

    await this.embedStep(workspaceId, contentId, text);
    const classified = await this.classifyStep(
      workspaceId,
      contentId,
      state,
      text,
    );
    const factsFailure = await this.factsStep(
      workspaceId,
      contentId,
      classified.kind,
      text,
    );
    // The content is usable without a kind or facts, so a transient model
    // outage still ends READY; the marker lets a later request redo the step.
    const failure = classified.failure ?? factsFailure;

    await this.setStatus(workspaceId, contentId, "READY", {
      processedAt: new Date(),
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      embeddingModel: this.embeddings.model,
      embeddingDimensions: this.embeddings.dimensions,
      failedStep: failure?.step ?? null,
      error: failure?.message ?? null,
    });
  }

  /**
   * Whether an assistant-readable source still references the content: the
   * current version of an on, non-archived document, or a chat attachment that
   * is unfiled or belongs to such a document.
   */
  private async hasReadableSource(
    workspaceId: string,
    contentId: string,
  ): Promise<boolean> {
    const document = await this.prisma.document.findFirst({
      where: {
        workspaceId,
        aiAccess: true,
        archivedAt: null,
        currentVersion: { contentId },
      },
      select: { id: true },
    });
    if (document) return true;
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: {
        workspaceId,
        contentId,
        OR: [
          { documentId: null },
          { document: { aiAccess: true, archivedAt: null } },
        ],
      },
      select: { id: true },
    });
    return !!attachment;
  }

  private async load(
    workspaceId: string,
    contentId: string,
  ): Promise<ContentState | null> {
    return this.prisma.documentContent.findFirst({
      where: { id: contentId, workspaceId },
      select: {
        status: true,
        pipelineVersion: true,
        extractedText: true,
        documentKind: true,
        failedStep: true,
        embeddingModel: true,
      },
    });
  }

  private async resetDerived(
    workspaceId: string,
    contentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.documentContentChunk.deleteMany({
        where: { contentId, workspaceId },
      });
      await tx.documentFact.deleteMany({ where: { contentId, workspaceId } });
    });
    await this.prisma.documentContent.updateMany({
      where: { id: contentId, workspaceId },
      data: { documentKind: null, kindConfidence: null },
    });
  }

  /** Stored text, or null when the content type is unsupported. */
  private async extractStep(
    workspaceId: string,
    contentId: string,
    state: ContentState,
  ): Promise<string | null> {
    if (state.extractedText !== null) return state.extractedText;

    await this.setStatus(workspaceId, contentId, "EXTRACTING");
    const result = await this.contents.ensureText(workspaceId, contentId);
    if (result.status === "COMPLETED") return result.text ?? "";
    if (result.status === "UNSUPPORTED") {
      await this.setStatus(workspaceId, contentId, "UNSUPPORTED");
      return null;
    }
    throw new Error(
      result.status === "UNAVAILABLE"
        ? `Content ${contentId} has no readable source bytes`
        : `Text extraction failed for content ${contentId}`,
    );
  }

  private async embedStep(
    workspaceId: string,
    contentId: string,
    text: string,
  ): Promise<void> {
    const alreadyEmbedded = await this.prisma.documentContentChunk.count({
      where: {
        contentId,
        workspaceId,
        embeddingModel: this.embeddings.model,
      },
    });
    if (alreadyEmbedded > 0) return;

    await this.setStatus(workspaceId, contentId, "EMBEDDING");
    const { documentEmbedMaxChars } = this.config;
    const truncated = text.length > documentEmbedMaxChars;
    const chunks = chunkText(
      truncated ? text.slice(0, documentEmbedMaxChars) : text,
    );

    const vectors: (readonly number[])[] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
      const embedded = await this.embeddings.embed(
        batch.map((chunk) => chunk.text),
      );
      assertEmbeddingDimensions(embedded, this.embeddings.dimensions);
      if (embedded.length !== batch.length) {
        throw new Error(
          `Embedding provider returned ${embedded.length} vectors for ${batch.length} chunks`,
        );
      }
      vectors.push(...embedded);
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.documentContentChunk.deleteMany({
          where: { contentId, workspaceId },
        });
        for (const [index, chunk] of chunks.entries()) {
          const vectorLiteral = `[${vectors[index].join(",")}]`;
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "DocumentContentChunk" (
              "id", "contentId", "workspaceId", "ordinal", "text", "charStart",
              "charEnd", "embedding", "embeddingModel", "embeddingDimensions"
            ) VALUES (
              ${randomUUID()}, ${contentId}, ${workspaceId}, ${chunk.ordinal},
              ${chunk.text}, ${chunk.charStart}, ${chunk.charEnd},
              ${vectorLiteral}::vector, ${this.embeddings.model},
              ${this.embeddings.dimensions}
            )
          `);
        }
      },
      { timeout: CHUNK_TRANSACTION_TIMEOUT_MS },
    );
    await this.prisma.documentContent.updateMany({
      where: { id: contentId, workspaceId },
      data: { truncated },
    });
  }

  /** The document kind (null when undetermined) and any model failure. */
  private async classifyStep(
    workspaceId: string,
    contentId: string,
    state: ContentState,
    text: string,
  ): Promise<{ kind: string | null; failure?: StepFailure }> {
    if (state.documentKind) return { kind: state.documentKind };
    if (text.trim() === "") return { kind: null };

    await this.setStatus(workspaceId, contentId, "CLASSIFYING");
    try {
      const { kind, confidence } = await classifyDocument(
        this.models,
        text,
        this.config.documentKindMinConfidence,
      );
      await this.prisma.documentContent.updateMany({
        where: { id: contentId, workspaceId },
        data: { documentKind: kind, kindConfidence: confidence },
      });
      return { kind };
    } catch (error) {
      this.logger.warn(
        `Classification of content ${contentId} failed: ${errorMessage(error)}`,
      );
      return {
        kind: null,
        failure: { step: "CLASSIFYING", message: errorMessage(error) },
      };
    }
  }

  private async factsStep(
    workspaceId: string,
    contentId: string,
    kind: string | null,
    text: string,
  ): Promise<StepFailure | undefined> {
    if (!kind || !isFactKind(kind)) return undefined;
    const existing = await this.prisma.documentFact.count({
      where: { contentId, workspaceId },
    });
    if (existing > 0) return undefined;

    let facts: ExtractedFact[];
    try {
      facts = await extractFacts(this.models, kind, text);
    } catch (error) {
      this.logger.warn(
        `Fact extraction for content ${contentId} failed: ${errorMessage(error)}`,
      );
      return { step: "FACTS", message: errorMessage(error) };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentFact.deleteMany({ where: { contentId, workspaceId } });
      if (facts.length === 0) return;
      await tx.documentFact.createMany({
        data: facts.map((fact) => ({
          workspaceId,
          contentId,
          subjectKey: fact.subjectKey,
          subjectType: fact.subjectType,
          subjectRole: fact.subjectRole,
          field: fact.field,
          value: fact.value,
          normalizedValue: fact.normalizedValue,
          quote: fact.quote,
          charStart: fact.charStart,
          confidence: fact.confidence,
        })),
      });
    });
    return undefined;
  }

  private async setStatus(
    workspaceId: string,
    contentId: string,
    status: DocumentContentStatus,
    extra: Prisma.DocumentContentUpdateManyMutationInput = {},
  ): Promise<void> {
    await this.prisma.documentContent.updateMany({
      where: { id: contentId, workspaceId },
      data: { ...extra, status },
    });
    this.events.emit({ workspaceId, contentId, status });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
