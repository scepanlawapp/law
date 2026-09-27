import type { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import type { MastraCompositeStore } from "@mastra/core/storage";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";

/** Mastra-owned tables live here; Prisma only manages `public`. */
export const MASTRA_SCHEMA_NAME = "mastra";
export const MASTRA_SERVICE_NAME = "law-assistant";

export interface LawMastraOptions {
  connectionString: string;
  schemaName?: string;
  /** Export agent/tool/model spans to Mastra storage (opt-in). */
  tracing?: boolean;
  agents?: Record<string, Agent>;
  /** Test seam: replaces the Postgres store. */
  storage?: MastraCompositeStore;
}

/**
 * Mastra instance backed by Postgres in a separate schema. Holds traces now and
 * workflow/approval snapshots later; conversation history stays in our Prisma
 * tables — see AI_ARCHITECTURE.md §6.
 */
export function createLawMastra(options: LawMastraOptions): Mastra {
  return new Mastra({
    storage:
      options.storage ??
      new PostgresStore({
        id: "law-mastra-store",
        connectionString: options.connectionString,
        schemaName: options.schemaName ?? MASTRA_SCHEMA_NAME,
      }),
    agents: options.agents,
    ...(options.tracing
      ? {
          observability: new Observability({
            configs: {
              default: {
                serviceName: MASTRA_SERVICE_NAME,
                exporters: [new MastraStorageExporter()],
              },
            },
          }),
        }
      : {}),
  });
}
