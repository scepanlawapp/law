import "dotenv/config";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import {
  LEGAL_EMBEDDING_DIMENSIONS,
  LEGAL_EMBEDDING_MODEL,
} from "@law/knowledge";
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_FORMAT_VERSION,
  SnapshotChunk,
  SnapshotLine,
} from "./legal-corpus-format";

const PAGE_SIZE = 500;

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const out =
    option("out") ?? `tmp/legal-corpus/legal-corpus-${date}.ndjson.gz`;
  const prisma = new PrismaClient();

  try {
    const sources = await prisma.legalSource.findMany({
      where: { workspaceId: null },
      orderBy: { slug: "asc" },
      include: {
        versions: {
          where: {
            indexingStatus: "INDEXED",
            embeddingModel: LEGAL_EMBEDDING_MODEL,
            embeddingDimensions: LEGAL_EMBEDDING_DIMENSIONS,
          },
          orderBy: { createdAt: "asc" },
          include: { _count: { select: { chunks: true } } },
        },
      },
    });
    const exported = sources.filter((source) => source.versions.length);
    const versions = exported.flatMap((source) => source.versions);
    const [migration] = await prisma.$queryRaw<{ name: string }[]>`
      SELECT "migration_name" AS "name" FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ORDER BY "migration_name" DESC LIMIT 1
    `;

    await mkdir(dirname(out), { recursive: true });
    const gzip = createGzip();
    const file = createWriteStream(out);
    gzip.pipe(file);
    const write = async (line: SnapshotLine): Promise<void> => {
      if (!gzip.write(`${JSON.stringify(line)}\n`)) await once(gzip, "drain");
    };

    await write({
      type: "header",
      format: SNAPSHOT_FORMAT,
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      embeddingModel: LEGAL_EMBEDDING_MODEL,
      embeddingDimensions: LEGAL_EMBEDDING_DIMENSIONS,
      latestMigration: migration?.name ?? null,
      exportedAt: new Date().toISOString(),
      sources: exported.length,
      versions: versions.length,
      chunks: versions.reduce((sum, version) => sum + version._count.chunks, 0),
    });

    for (const source of exported) {
      await write({
        type: "source",
        id: source.id,
        slug: source.slug,
        title: source.title,
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
        canonicalUrl: source.canonicalUrl,
        jurisdiction: source.jurisdiction,
        language: source.language,
        visibility: source.visibility,
      });
      for (const version of source.versions) {
        await write({
          type: "version",
          id: version.id,
          contentHash: version.contentHash,
          versionLabel: version.versionLabel,
          sourceScript: version.sourceScript,
          retrievedAt: version.retrievedAt.toISOString(),
          parserVersion: version.parserVersion,
          embeddingModel: version.embeddingModel,
          embeddingDimensions: version.embeddingDimensions,
          chunks: version._count.chunks,
        });
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const chunks = await prisma.$queryRaw<Omit<SnapshotChunk, "type">[]>`
            SELECT "id", "ordinal", "text", "articleNumber", "paragraphNumber",
              "pointNumber", "embedding"::text AS "embedding"
            FROM "LegalChunk"
            WHERE "versionId" = ${version.id}
            ORDER BY "ordinal"
            LIMIT ${PAGE_SIZE} OFFSET ${offset}
          `;
          for (const chunk of chunks) await write({ type: "chunk", ...chunk });
          if (chunks.length < PAGE_SIZE) break;
        }
      }
      console.error(`exported ${source.slug}`);
    }

    gzip.end();
    await once(file, "finish");
    console.log(
      JSON.stringify(
        {
          out,
          sources: exported.length,
          versions: versions.length,
          latestMigration: migration?.name ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
