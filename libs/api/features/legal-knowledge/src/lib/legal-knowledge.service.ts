import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  EmbeddingProvider,
  LegalSourceMetadata,
  LEGAL_EMBEDDING_MODEL,
} from "@law/knowledge";
import { PrismaService, WorkspaceContextService } from "@law/core";
import { toLatin } from "@law/transliteration";

export const LEGAL_EMBEDDING_PROVIDER = Symbol("LEGAL_EMBEDDING_PROVIDER");

export interface LegalKnowledgeSearchResult {
  id: string;
  text: string;
  score: number;
  source: Pick<
    LegalSourceMetadata,
    "title" | "publisher" | "sourceUrl" | "jurisdiction"
  >;
  articleNumber: string | null;
  paragraphNumber: number | null;
  pointNumber: number | null;
}

@Injectable()
export class LegalKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEGAL_EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async search(
    query: string,
    limit: number,
  ): Promise<LegalKnowledgeSearchResult[]> {
    const workspaceId = WorkspaceContextService.required.workspaceId;
    const [vector] = await this.embeddings.embed([toLatin(query.trim())]);
    if (!vector) return [];

    const vectorLiteral = `[${vector.join(",")}]`;
    const rows = await this.prisma.$queryRaw<
      LegalKnowledgeSearchResult[]
    >(Prisma.sql`
      SELECT
        chunk."id",
        chunk."text",
        1 - (chunk."embedding" <=> ${vectorLiteral}::vector) AS "score",
        json_build_object(
          'title', source."title",
          'publisher', source."publisher",
          'sourceUrl', source."sourceUrl",
          'jurisdiction', source."jurisdiction"
        ) AS "source",
        chunk."articleNumber",
        chunk."paragraphNumber",
        chunk."pointNumber"
      FROM "LegalChunk" chunk
      INNER JOIN "LegalSourceVersion" version ON version."id" = chunk."versionId"
      INNER JOIN "LegalSource" source ON source."id" = version."sourceId"
      WHERE version."indexingStatus" = 'INDEXED'
        AND version."embeddingModel" = ${LEGAL_EMBEDDING_MODEL}
        AND (source."visibility" = 'PUBLIC' OR source."workspaceId" = ${workspaceId})
        AND chunk."embedding" IS NOT NULL
      ORDER BY chunk."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `);

    return rows;
  }
}
