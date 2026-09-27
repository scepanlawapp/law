import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import {
  chunkLegalText,
  fetchLegalHtml,
  LEGAL_EMBEDDING_MODEL,
  LegalSourceManifestEntry,
  OpenRouterEmbeddingProvider,
  PARAGRAF_CORE_SOURCES,
  PARAGRAF_LABOR_LAW_URL,
  parseLegalHtml,
} from "@law/knowledge";
import { LegalKnowledgeIngestionService } from "@law/legal-knowledge";

const FETCH_PAUSE_MS = 2_000;

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function selectSources(): LegalSourceManifestEntry[] {
  const area = option("area");
  if (!process.argv.includes("--all") && !area) {
    return [
      {
        slug: option("slug") ?? "zakon-o-radu",
        url: option("url") ?? PARAGRAF_LABOR_LAW_URL,
        area: "labor",
      },
    ];
  }
  const sources = PARAGRAF_CORE_SOURCES.filter(
    (entry) => !area || entry.area === area,
  );
  if (!sources.length) {
    const areas = [...new Set(PARAGRAF_CORE_SOURCES.map((e) => e.area))];
    throw new Error(`Unknown area "${area}". Known: ${areas.join(", ")}`);
  }
  return sources;
}

async function ingestOne(
  source: LegalSourceManifestEntry,
  ingestion: LegalKnowledgeIngestionService | undefined,
  options: { workspaceId?: string; force: boolean },
): Promise<Record<string, unknown>> {
  const html = await fetchLegalHtml(source.url);
  const parsed = parseLegalHtml(html, { sourceUrl: source.url });

  if (!ingestion) {
    const chunks = chunkLegalText(parsed.rawText, {
      ...parsed.metadata,
      sourceScript: parsed.sourceScript,
      retrievedAt: new Date().toISOString(),
      contentHash: parsed.contentHash,
    });
    return {
      sourceUrl: source.url,
      slug: source.slug,
      title: parsed.metadata.title,
      sourceScript: parsed.sourceScript,
      contentHash: parsed.contentHash,
      chunks: chunks.length,
      embeddingModel: LEGAL_EMBEDDING_MODEL,
      embeddingDimensions: 1024,
    };
  }

  const result = await ingestion.ingest(parsed, {
    slug: source.slug,
    workspaceId: options.workspaceId,
    force: options.force,
  });
  return { slug: source.slug, ...result };
}

async function main(): Promise<void> {
  const sources = selectSources();
  const options = {
    workspaceId: option("workspace-id"),
    force: process.argv.includes("--force"),
  };
  const dryRun = process.argv.includes("--dry-run");

  let prisma: PrismaClient | undefined;
  let ingestion: LegalKnowledgeIngestionService | undefined;
  if (!dryRun) {
    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey)
      throw new Error("OPENROUTER_API_KEY is required for ingestion");
    prisma = new PrismaClient();
    const provider = new OpenRouterEmbeddingProvider({
      apiKey,
      baseUrl:
        process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1",
      model: process.env["LEGAL_EMBEDDING_MODEL"] ?? LEGAL_EMBEDDING_MODEL,
    });
    ingestion = new LegalKnowledgeIngestionService(prisma, provider);
  }

  try {
    if (sources.length === 1) {
      const result = await ingestOne(sources[0], ingestion, options);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const summary: Record<string, unknown>[] = [];
    for (const [index, source] of sources.entries()) {
      if (index > 0) await sleep(FETCH_PAUSE_MS);
      let row: Record<string, unknown>;
      try {
        const result = await ingestOne(source, ingestion, options);
        row = {
          slug: source.slug,
          area: source.area,
          status: result["status"] ?? "DRY_RUN",
          chunks: result["chunks"],
        };
      } catch (error) {
        row = {
          slug: source.slug,
          area: source.area,
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      summary.push(row);
      console.error(
        `[${index + 1}/${sources.length}] ${source.slug}: ${row["status"]}`,
      );
    }

    console.table(summary);
    if (summary.some((row) => row["status"] === "FAILED")) process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
