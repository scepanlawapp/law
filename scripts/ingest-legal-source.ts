import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  chunkLegalText,
  fetchLegalHtml,
  LEGAL_EMBEDDING_MODEL,
  OpenRouterEmbeddingProvider,
  PARAGRAF_LABOR_LAW_URL,
  parseLegalHtml,
} from "@law/knowledge";
import { LegalKnowledgeIngestionService } from "@law/legal-knowledge";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const sourceUrl = option("url") ?? PARAGRAF_LABOR_LAW_URL;
  const slug = option("slug") ?? "zakon-o-radu";
  const workspaceId = option("workspace-id");
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  const html = await fetchLegalHtml(sourceUrl);
  const parsed = parseLegalHtml(html, { sourceUrl });
  const chunks = chunkLegalText(parsed.rawText, {
    ...parsed.metadata,
    sourceScript: parsed.sourceScript,
    retrievedAt: new Date().toISOString(),
    contentHash: parsed.contentHash,
  });

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          sourceUrl,
          slug,
          title: parsed.metadata.title,
          sourceScript: parsed.sourceScript,
          contentHash: parsed.contentHash,
          chunks: chunks.length,
          embeddingModel: LEGAL_EMBEDDING_MODEL,
          embeddingDimensions: 1024,
        },
        null,
        2,
      ),
    );
    return;
  }

  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for ingestion");
  const prisma = new PrismaClient();
  try {
    const provider = new OpenRouterEmbeddingProvider({
      apiKey,
      baseUrl:
        process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1",
      model: process.env["LEGAL_EMBEDDING_MODEL"] ?? LEGAL_EMBEDDING_MODEL,
    });
    const ingestion = new LegalKnowledgeIngestionService(prisma, provider);
    const result = await ingestion.ingest(parsed, { slug, workspaceId, force });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
