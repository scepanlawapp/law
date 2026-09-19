import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  chunkLegalText,
  EmbeddingProvider,
  LegalSourceMetadata,
  ParsedLegalSource,
} from "@law/knowledge";
import { PrismaService } from "@law/core";
import { LEGAL_EMBEDDING_PROVIDER } from "./legal-knowledge.service";

const BATCH_SIZE = 16;

export interface LegalIngestionOptions {
  slug: string;
  workspaceId?: string;
  force?: boolean;
  maxChars?: number;
}

export interface LegalIngestionResult {
  sourceId: string;
  versionId?: string;
  status: "INDEXED" | "SKIPPED";
  chunks: number;
}

@Injectable()
export class LegalKnowledgeIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEGAL_EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async ingest(
    parsed: ParsedLegalSource,
    options: LegalIngestionOptions,
  ): Promise<LegalIngestionResult> {
    const existingSource = await this.prisma.legalSource.findFirst({
      where: { slug: options.slug, workspaceId: options.workspaceId ?? null },
    });
    const source = existingSource
      ? await this.prisma.legalSource.update({
          where: { id: existingSource.id },
          data: {
            title: parsed.metadata.title,
            publisher: parsed.metadata.publisher,
            sourceUrl: parsed.metadata.sourceUrl,
            canonicalUrl: parsed.metadata.canonicalUrl,
          },
        })
      : await this.prisma.legalSource.create({
          data: {
            id: randomUUID(),
            workspaceId: options.workspaceId,
            slug: options.slug,
            ...parsed.metadata,
          },
        });

    const existingVersion = await this.prisma.legalSourceVersion.findUnique({
      where: {
        sourceId_contentHash: {
          sourceId: source.id,
          contentHash: parsed.contentHash,
        },
      },
    });
    if (existingVersion && !options.force) {
      return {
        sourceId: source.id,
        versionId: existingVersion.id,
        status: "SKIPPED",
        chunks: 0,
      };
    }

    const version = await this.prisma.legalSourceVersion.create({
      data: {
        sourceId: source.id,
        contentHash: parsed.contentHash,
        sourceScript: parsed.sourceScript,
        parserVersion: "paragraf-html-v1",
        embeddingModel: this.embeddings.model,
        embeddingDimensions: this.embeddings.dimensions,
        indexingStatus: "PENDING",
      },
    });

    try {
      const metadata = {
        ...parsed.metadata,
        sourceScript: parsed.sourceScript,
        retrievedAt: new Date().toISOString(),
        contentHash: parsed.contentHash,
      };
      const chunks = chunkLegalText(parsed.rawText, metadata, {
        maxChars: options.maxChars,
      });

      for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
        const batch = chunks.slice(start, start + BATCH_SIZE);
        const vectors = await this.embeddings.embed(
          batch.map((chunk) => chunk.text),
        );
        await this.prisma.$transaction(async (transaction) => {
          for (const [index, chunk] of batch.entries()) {
            const vector = vectors[index];
            if (!vector)
              throw new Error(`Missing embedding for chunk ${chunk.ordinal}`);
            const vectorLiteral = `[${vector.join(",")}]`;
            await transaction.$executeRaw(Prisma.sql`
              INSERT INTO "LegalChunk" (
                "id", "versionId", "ordinal", "text", "articleNumber",
                "paragraphNumber", "pointNumber", "embedding", "embeddingModel",
                "embeddingDimensions"
              ) VALUES (
                ${randomUUID()}, ${version.id}, ${chunk.ordinal}, ${chunk.text},
                ${chunk.articleNumber ?? null}, ${chunk.paragraphNumber ?? null},
                ${chunk.pointNumber ?? null}, ${vectorLiteral}::vector,
                ${this.embeddings.model}, ${this.embeddings.dimensions}
              )
            `);
          }
        });
      }

      await this.prisma.legalSourceVersion.update({
        where: { id: version.id },
        data: { indexingStatus: "INDEXED" },
      });
      return {
        sourceId: source.id,
        versionId: version.id,
        status: "INDEXED",
        chunks: chunks.length,
      };
    } catch (error) {
      await this.prisma.legalSourceVersion.update({
        where: { id: version.id },
        data: {
          indexingStatus: "FAILED",
          indexingError:
            error instanceof Error ? error.message : "Indexing failed",
        },
      });
      throw error;
    }
  }
}
