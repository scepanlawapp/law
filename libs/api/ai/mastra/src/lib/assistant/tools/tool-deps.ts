import type { GroundingSearchHit } from "@law/legal-grounding";

/** Read-only case facts a tool may show the model. */
export interface AssistantCaseFacts {
  caseNumber: string;
  name: string;
  status: string;
  priority: string;
  client: string;
  responsible: string;
  opposingParty: string | null;
  description: string | null;
  openedDate: string | null;
  closedDate: string | null;
}

export type AssistantCaseLookup =
  | { found: "none"; message: string }
  | { found: "one"; case: AssistantCaseFacts }
  | { found: "many"; candidates: AssistantCaseFacts[] };

/**
 * Business operations the assistant tools call. Implemented by the Nest chat
 * feature on top of existing services; this library never imports Nest.
 */
export interface LegalAssistantToolDeps {
  searchLegalSources(
    query: string,
    limit: number,
    workspaceId: string,
  ): Promise<readonly GroundingSearchHit[]>;
  lookupCase(input: {
    workspaceId: string;
    sessionCaseId: string | null;
    reference?: string;
  }): Promise<AssistantCaseLookup>;
}
