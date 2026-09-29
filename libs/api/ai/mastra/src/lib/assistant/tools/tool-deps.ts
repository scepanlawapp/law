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
  /** Current responsible lawyers (single-case lookups only). */
  responsibleLawyers?: string[];
  openTaskCount?: number;
  openDeadlineCount?: number;
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
  /** The user the assistant works for ("me"): the conversation's owner. */
  userId: string | null;
  userDisplayName: string | null;
}

/** Read-only client facts a tool may show the model (no personal identifiers). */
export interface AssistantClientFacts {
  clientNumber: string;
  name: string;
  type: string;
  status: string;
  responsible: string | null;
  email: string | null;
  phone: string | null;
  activeCaseCount: number;
}

export interface AssistantClientDetail extends AssistantClientFacts {
  taxNumber: string | null;
  registrationNumber: string | null;
  notes: string | null;
  contacts: Array<{
    name: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  }>;
  openCases: Array<{
    caseNumber: string;
    name: string;
    status: string;
    priority: string;
  }>;
}

export type AssistantClientLookup =
  | { found: "none"; message: string }
  | { found: "one"; client: AssistantClientDetail }
  | { found: "many"; candidates: AssistantClientFacts[] };

/** A task, deadline, or event, flattened for the model. */
export interface AssistantWorkItem {
  kind: "TASK" | "DEADLINE" | "EVENT";
  title: string;
  status: string;
  /** Deadline or event type; task priority. */
  type: string | null;
  /** YYYY-MM-DD, or YYYY-MM-DD HH:mm (Europe/Belgrade) when timed. */
  due: string | null;
  overdue: boolean;
  person: string | null;
  case: string | null;
  client: string | null;
  location: string | null;
}

export interface AssistantActivityEntry {
  /** YYYY-MM-DD HH:mm (Europe/Belgrade). */
  date: string;
  /** JOURNAL: a logged call/meeting/email; LOG: a work-item change. */
  kind: "JOURNAL" | "LOG";
  type: string;
  title: string | null;
  text: string | null;
  author: string | null;
}

/** Result of a read-only list tool. `filters` states how references were resolved. */
export type AssistantListResult<T> =
  | {
      status: "OK";
      filters: Record<string, string>;
      items: T[];
      total: number;
      truncated: boolean;
    }
  | {
      status: "NOT_FOUND" | "AMBIGUOUS" | "INVALID" | "UNAVAILABLE";
      message: string;
      candidates?: string[];
    };

export const ASSISTANT_WORK_KINDS = [
  "task",
  "deadline",
  "event",
  "all",
] as const;
export const ASSISTANT_WORK_STATES = ["open", "done", "all"] as const;

export interface WorkItemQuery {
  kind: (typeof ASSISTANT_WORK_KINDS)[number];
  state: (typeof ASSISTANT_WORK_STATES)[number];
  case?: string;
  client?: string;
  /** "me", a colleague's name, or "office". */
  person?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  overdueOnly?: boolean;
  /** The conversation's linked case: the default scope when nothing else is given. */
  linkedCaseId: string | null;
}

export interface ActivityQuery {
  case?: string;
  client?: string;
  limit: number;
  linkedCaseId: string | null;
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

/** A readable document: a case document or a chat attachment not yet filed on a case. */
export interface AssistantDocumentEntry {
  /** Pass back to read_document / search_documents. */
  ref: string;
  title: string;
  fileName: string;
  /** CASE: filed on the conversation's case; CHAT: attached in this conversation. */
  origin: "CASE" | "CHAT";
  /** PENDING: text not extracted yet (read_document extracts it). */
  textStatus: "READY" | "PENDING" | "FAILED" | "UNSUPPORTED";
  /** YYYY-MM-DD */
  addedAt: string;
}

export type AssistantDocumentList =
  | {
      status: "OK";
      /** Case number of the conversation's case, or null when not linked. */
      case: string | null;
      items: AssistantDocumentEntry[];
      truncated: boolean;
    }
  | { status: "UNAVAILABLE"; message: string };

export type AssistantDocumentRead =
  | {
      status: "OK";
      ref: string;
      title: string;
      /** Character offset of `text` within the document. */
      offset: number;
      /** Pass as `offset` to continue; null at the end of the document. */
      nextOffset: number | null;
      totalChars: number;
      text: string;
    }
  | {
      status: "NOT_FOUND" | "NO_TEXT" | "UNAVAILABLE";
      message: string;
    };

export interface AssistantDocumentMatch {
  ref: string;
  title: string;
  /** Total occurrences; `hits` is capped. */
  count: number;
  hits: Array<{ offset: number; snippet: string }>;
}

export type AssistantDocumentSearch =
  | {
      status: "OK";
      query: string;
      /** Documents whose text was searched. */
      searched: number;
      /** Titles of documents without readable text. */
      unreadable: string[];
      matches: AssistantDocumentMatch[];
    }
  | { status: "NOT_FOUND" | "UNAVAILABLE"; message: string };

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
  searchCases(
    scope: AssistantTurnScope,
    args: {
      query?: string;
      status?: string;
      priority?: string;
      client?: string;
      responsible?: string;
    },
  ): Promise<AssistantListResult<AssistantCaseFacts>>;
  searchClients(
    scope: AssistantTurnScope,
    args: { query?: string; status?: string; responsible?: string },
  ): Promise<AssistantListResult<AssistantClientFacts>>;
  getClient(
    scope: AssistantTurnScope,
    args: { reference: string },
  ): Promise<AssistantClientLookup>;
  listWorkItems(
    scope: AssistantTurnScope,
    args: WorkItemQuery,
  ): Promise<AssistantListResult<AssistantWorkItem>>;
  getAgenda(
    scope: AssistantTurnScope,
    args: { from: string; to: string; person?: string },
  ): Promise<AssistantListResult<AssistantWorkItem>>;
  listActivity(
    scope: AssistantTurnScope,
    args: ActivityQuery,
  ): Promise<AssistantListResult<AssistantActivityEntry>>;
  /** Chat attachments and the linked case's documents (read-only). */
  listDocuments(scope: AssistantTurnScope): Promise<AssistantDocumentList>;
  readDocument(
    scope: AssistantTurnScope,
    args: { ref: string; offset?: number },
  ): Promise<AssistantDocumentRead>;
  searchDocuments(
    scope: AssistantTurnScope,
    args: { query: string; ref?: string },
  ): Promise<AssistantDocumentSearch>;
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
