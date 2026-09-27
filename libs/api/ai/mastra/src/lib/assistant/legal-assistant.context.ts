import { RequestContext } from "@mastra/core/request-context";
import type { CitationRegistry } from "./citation-registry";

/** Per-turn values the orchestrator puts on Mastra's RequestContext. */
export interface LegalAssistantRequestValues {
  workspaceId: string;
  sessionCaseId: string | null;
  language: "sr" | "en";
  caseContext: string | null;
  citations: CitationRegistry;
}

export type LegalAssistantRequestContext =
  RequestContext<LegalAssistantRequestValues>;

export function createLegalAssistantRequestContext(
  values: LegalAssistantRequestValues,
): LegalAssistantRequestContext {
  const context = new RequestContext<LegalAssistantRequestValues>();
  context.set("workspaceId", values.workspaceId);
  context.set("sessionCaseId", values.sessionCaseId);
  context.set("language", values.language);
  context.set("caseContext", values.caseContext);
  context.set("citations", values.citations);
  return context;
}
