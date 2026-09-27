import { createTool } from "@mastra/core/tools";
import {
  formatGroundingContextBlock,
  retrieveGroundingCitations,
} from "@law/legal-grounding";
import { toLatin } from "@law/transliteration";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const SEARCH_LEGAL_SOURCES_TOOL_ID = "search_legal_sources";

/** Side effect: none. */
export function createSearchLegalSourcesTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SEARCH_LEGAL_SOURCES_TOOL_ID,
    description:
      "Searches the office's knowledge base of Serbian regulations (laws, articles). Returns numbered sources [n] with the article and an excerpt. Use focused queries, e.g. 'Zakon o radu godišnji odmor' or 'ZOO zastarelost potraživanja'.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(3)
        .max(300)
        .describe("Search query in Serbian, Latin script"),
    }),
    execute: async ({ query }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      const workspaceId = requestContext.get("workspaceId");
      const citations = requestContext.get("citations");
      const found = await retrieveGroundingCitations(
        (text, limit) => deps.searchLegalSources(text, limit, workspaceId),
        [toLatin(query)],
      );
      const numbered = citations.add(found);
      return {
        count: numbered.length,
        sources:
          formatGroundingContextBlock(numbered) ||
          "Nema relevantnih izvora u bazi znanja za ovaj upit.",
      };
    },
  });
}
