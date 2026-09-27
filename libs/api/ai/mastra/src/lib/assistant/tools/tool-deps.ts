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

/** Identifies the agent turn a tool runs in (from the RequestContext). */
export interface AssistantTurnScope {
  workspaceId: string;
  sessionId: string;
  /** The `agent-turn` WorkflowJob. */
  jobId: string;
  correlationId: string;
  /** The user message that triggered the turn. */
  messageId: string;
  language: "sr" | "en";
}

export type DraftToolResult =
  | {
      status: "DRAFT_READY";
      draftId: string;
      version: number;
      approvalStatus: string;
      missingFields: string[];
      warnings: string[];
      citationCount: number;
      excerpt: string;
    }
  | { status: "UNSUPPORTED"; jobType: string | null; message: string }
  | { status: "NO_CONTEXT" | "NOT_FOUND" | "FAILED"; message: string };

export interface DraftListItem {
  draftId: string;
  version: number;
  approvalStatus: string;
  createdAt: string;
  title: string;
}

export type DraftReadResult =
  | {
      status: "FOUND";
      draftId: string;
      version: number;
      approvalStatus: string;
      warnings: string[];
      citations: Array<{
        marker: number;
        articleNumber: string | null;
        sourceTitle: string;
      }>;
      text: string;
      truncated: boolean;
    }
  | { status: "NOT_FOUND"; message: string };

export const ASSISTANT_DEADLINE_TYPES = [
  "COURT",
  "STATUTORY",
  "CONTRACTUAL",
  "INTERNAL",
  "OTHER",
] as const;

/** Record changes the agent may only propose (AI_ARCHITECTURE.md §5). */
export type AssistantActionRequest =
  | { type: "link_case"; caseReference: string }
  | {
      type: "create_deadline";
      title: string;
      /** YYYY-MM-DD */
      dueDate: string;
      deadlineType?: (typeof ASSISTANT_DEADLINE_TYPES)[number];
      description?: string;
      caseReference?: string;
    }
  | { type: "create_tasks_from_brief"; briefId?: string };

export type ActionProposalResult =
  | {
      status: "CONFIRMATION_REQUIRED";
      pendingActionId: string;
      summary: string;
      details: string[];
    }
  | { status: "INVALID"; message: string };

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
  /** Drafts a lawsuit from the conversation (reversible: needs lawyer approval). */
  draftLawsuit(
    scope: AssistantTurnScope,
    args: { note?: string },
  ): Promise<DraftToolResult>;
  /** Creates a new version of a conversation draft (reversible). */
  reviseDraft(
    scope: AssistantTurnScope,
    args: { instruction: string; draftId?: string },
  ): Promise<DraftToolResult>;
  getDraft(
    scope: AssistantTurnScope,
    args: { draftId?: string },
  ): Promise<DraftReadResult>;
  listDrafts(scope: AssistantTurnScope): Promise<{ drafts: DraftListItem[] }>;
  /** Validates and stores a proposal; nothing changes until a user approves it. */
  proposeAction(
    scope: AssistantTurnScope,
    request: AssistantActionRequest,
  ): Promise<ActionProposalResult>;
}
