import "dotenv/config";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  incompatibility,
  SnapshotChunk,
  SnapshotHeader,
  SnapshotLine,
  SnapshotSource,
  SnapshotVersion,
} from "./legal-corpus-format";

const INSERT_BATCH = 100;

interface PendingVersion {
  source: SnapshotSource;
  version: SnapshotVersion;
  chunks: SnapshotChunk[];
}

type VersionOutcome = "INDEXED" | "SKIPPED";

async function importVersion(
  prisma: PrismaClient,
  { source, version, chunks }: PendingVersion,
): Promise<VersionOutcome> {
  if (chunks.length !== version.chunks)
    throw new Error(
      `${source.slug}: expected ${version.chunks} chunks, file has ${chunks.length}`,
    );

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.legalSource.findFirst({
        where: { slug: source.slug, workspaceId: null },
      });
      const metadata = {
        title: source.title,
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
        canonicalUrl: source.canonicalUrl,
        jurisdiction: source.jurisdiction,
        language: source.language,
        visibility: source.visibility,
      };
      if (existing) {
        const duplicate = await tx.legalSourceVersion.findUnique({
          where: {
            sourceId_contentHash: {
              sourceId: existing.id,
              contentHash: version.contentHash,
            },
          },
        });
        if (duplicate) return "SKIPPED";
        await tx.legalSource.update({
          where: { id: existing.id },
          data: metadata,
        });
      }
      const sourceId =
        existing?.id ??
        (
          await tx.legalSource.create({
            data: { id: source.id, slug: source.slug, ...metadata },
          })
        ).id;

      await tx.legalSourceVersion.create({
        data: {
          id: version.id,
          sourceId,
          contentHash: version.contentHash,
          versionLabel: version.versionLabel,
          sourceScript: version.sourceScript,
          retrievedAt: new Date(version.retrievedAt),
          parserVersion: version.parserVersion,
          embeddingModel: version.embeddingModel,
          embeddingDimensions: version.embeddingDimensions,
          indexingStatus: "INDEXED",
        },
      });

      for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
        const rows = chunks.slice(start, start + INSERT_BATCH).map(
          (chunk) => Prisma.sql`(
            ${chunk.id}, ${version.id}, ${chunk.ordinal}, ${chunk.text},
            ${chunk.articleNumber}, ${chunk.paragraphNumber}, ${chunk.pointNumber},
            ${chunk.embedding}::vector, ${version.embeddingModel},
            ${version.embeddingDimensions}
          )`,
        );
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "LegalChunk" (
            "id", "versionId", "ordinal", "text", "articleNumber",
            "paragraphNumber", "pointNumber", "embedding", "embeddingModel",
            "embeddingDimensions"
          ) VALUES ${Prisma.join(rows)}
        `);
      }
      return "INDEXED";
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

async function assertMigrationApplied(
  prisma: PrismaClient,
  header: SnapshotHeader,
): Promise<void> {
  if (
    !header.latestMigration ||
    process.argv.includes("--skip-migration-check")
  )
    return;
  const [applied] = await prisma.$queryRaw<{ name: string }[]>`
    SELECT "migration_name" AS "name" FROM "_prisma_migrations"
    WHERE "migration_name" = ${header.latestMigration}
      AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
  `;
  if (!applied)
    throw new Error(
      `Snapshot was exported at migration ${header.latestMigration}, which is not applied here. ` +
        "Run `npm run db:migrate` (or pass --skip-migration-check).",
    );
}

async function main(): Promise<void> {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!file)
    throw new Error("Usage: npm run legal:import -- <snapshot.ndjson.gz>");

  const prisma = new PrismaClient();
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const summary: { slug: string; status: VersionOutcome; chunks: number }[] =
    [];
  let header: SnapshotHeader | undefined;
  let source: SnapshotSource | undefined;
  let pending: PendingVersion | undefined;

  const flush = async (): Promise<void> => {
    if (!pending) return;
    const status = await importVersion(prisma, pending);
    summary.push({
      slug: pending.source.slug,
      status,
      chunks: status === "INDEXED" ? pending.chunks.length : 0,
    });
    console.error(`${pending.source.slug}: ${status}`);
    pending = undefined;
  };

  try {
    for await (const raw of lines) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as SnapshotLine;
      if (!header) {
        if (line.type !== "header")
          throw new Error("Snapshot does not start with a header");
        const reason = incompatibility(line);
        if (reason) throw new Error(`Incompatible snapshot: ${reason}`);
        header = line;
        await assertMigrationApplied(prisma, header);
        continue;
      }
      switch (line.type) {
        case "source":
          await flush();
          source = line;
          break;
        case "version":
          await flush();
          if (!source) throw new Error("Version line before any source");
          pending = { source, version: line, chunks: [] };
          break;
        case "chunk":
          if (!pending) throw new Error("Chunk line before any version");
          pending.chunks.push(line);
          break;
        default:
          throw new Error(`Unexpected line type "${line.type}"`);
      }
    }
    await flush();
    if (!header) throw new Error("Snapshot is empty");
  } finally {
    await prisma.$disconnect();
  }

  console.table(summary);
  const indexed = summary.filter((row) => row.status === "INDEXED");
  console.log(
    JSON.stringify(
      {
        file,
        exportedAt: header.exportedAt,
        versionsIndexed: indexed.length,
        versionsSkipped: summary.length - indexed.length,
        chunksInserted: indexed.reduce((sum, row) => sum + row.chunks, 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
