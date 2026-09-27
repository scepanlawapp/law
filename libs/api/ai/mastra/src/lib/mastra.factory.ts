import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";

/** Mastra-owned tables live here; Prisma only manages `public`. */
export const MASTRA_SCHEMA_NAME = "mastra";

export interface LawMastraOptions {
  connectionString: string;
  schemaName?: string;
}

/**
 * Mastra instance for workflow/approval snapshots (phases 4–5). Conversation
 * history stays in our Prisma tables — see AI_ARCHITECTURE.md §6.
 * Not wired into the API boot yet.
 */
export function createLawMastra(options: LawMastraOptions): Mastra {
  return new Mastra({
    storage: new PostgresStore({
      id: "law-mastra-store",
      connectionString: options.connectionString,
      schemaName: options.schemaName ?? MASTRA_SCHEMA_NAME,
    }),
  });
}
