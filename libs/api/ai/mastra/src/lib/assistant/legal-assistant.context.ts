import { RequestContext } from "@mastra/core/request-context";
import type { CitationRegistry } from "./citation-registry";
import type { AssistantTurnScope } from "./tools/tool-deps";

/** Per-turn values the orchestrator puts on Mastra's RequestContext. */
export interface LegalAssistantRequestValues {
  workspaceId: string;
  sessionCaseId: string | null;
  language: "sr" | "en";
  caseContext: string | null;
  /** Drafts of this conversation, rendered by the context builder. */
  workspaceState: string | null;
  /** Portir's intent for the latest message. */
  intent: "ANSWER" | "DRAFT";
  turn: AssistantTurnScope;
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
  context.set("workspaceState", values.workspaceState);
  context.set("intent", values.intent);
  context.set("turn", values.turn);
  context.set("citations", values.citations);
  return context;
}
