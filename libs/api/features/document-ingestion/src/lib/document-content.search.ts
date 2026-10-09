import { Inject, Injectable } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import type { EmbeddingProvider } from "@law/knowledge";
import { toLatin } from "@law/transliteration";
import { Prisma, type DocumentFact } from "@prisma/client";
import { DOCUMENT_EMBEDDING_PROVIDER } from "./document-ingestion.providers";

export const MAX_CHUNK_SEARCH_LIMIT = 12;

export interface DocumentChunkHit {
  contentId: string;
  ordinal: number;
  text: string;
  charStart: number;
  charEnd: number;
  /** Cosine similarity, higher is closer. */
  score: number;
}

export type DocumentFactRow = Pick<
  DocumentFact,
  | "contentId"
  | "subjectKey"
  | "subjectType"
  | "subjectRole"
  | "field"
  | "value"
  | "normalizedValue"
  | "quote"
  | "charStart"
  | "confidence"
>;

/**
 * Semantic search over stored document chunks and reads of extracted facts.
 * It is the only place that runs raw SQL on `DocumentContentChunk`. It knows
 * nothing about AI access: the caller decides which content ids may be read
 * and passes exactly those, together with the workspace id.
 */
@Injectable()
export class DocumentContentSearch {
  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(DOCUMENT_EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async searchChunks(
    workspaceId: string,
    contentIds: string[],
    query: string,
    limit: number,
  ): Promise<DocumentChunkHit[]> {
    if (contentIds.length === 0) return [];
    const cap = Math.min(
      Math.max(Math.trunc(limit) || 1, 1),
      MAX_CHUNK_SEARCH_LIMIT,
    );
    const [vector] = await this.embeddings.embed([toLatin(query.trim())]);
    if (!vector) return [];

    const vectorLiteral = `[${vector.join(",")}]`;
    return this.prisma.$queryRaw<DocumentChunkHit[]>(Prisma.sql`
      SELECT
        chunk."contentId",
        chunk."ordinal",
        chunk."text",
        chunk."charStart",
        chunk."charEnd",
        1 - (chunk."embedding" <=> ${vectorLiteral}::vector) AS "score"
      FROM "DocumentContentChunk" chunk
      WHERE chunk."workspaceId" = ${workspaceId}
        AND chunk."contentId" = ANY(${contentIds}::text[])
        AND chunk."embeddingModel" = ${this.embeddings.model}
        AND chunk."embedding" IS NOT NULL
      ORDER BY chunk."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${cap}
    `);
  }

  async factsFor(
    workspaceId: string,
    contentIds: string[],
  ): Promise<DocumentFactRow[]> {
    if (contentIds.length === 0) return [];
    return this.prisma.documentFact.findMany({
      where: { workspaceId, contentId: { in: contentIds } },
      orderBy: [{ contentId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        contentId: true,
        subjectKey: true,
        subjectType: true,
        subjectRole: true,
        field: true,
        value: true,
        normalizedValue: true,
        quote: true,
        charStart: true,
        confidence: true,
      },
    });
  }
}
