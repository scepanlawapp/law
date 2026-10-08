import type {
  ContractReviewType,
  DocumentKind,
  DraftDocumentType,
} from "@law/api-interfaces";
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
      /** Serbian name of the document type ("Žalba"). */
      documentType: string;
      version: number;
      approvalStatus: string;
      missingFields: string[];
      warnings: string[];
      citationCount: number;
      excerpt: string;
    }
  | { status: "NO_CONTEXT" | "NOT_FOUND" | "FAILED"; message: string };

export type ContractReviewToolResult =
  | {
      status: "REVIEW_READY";
      analysisId: string;
      documentTitle: string;
      /** Serbian name of the checklist used ("Ugovor o radu"). */
      contractType: string;
      summary: string;
      issueCounts: { high: number; medium: number; low: number };
      /** Highest-risk issues first, capped. */
      topIssues: Array<{
        title: string;
        risk: string;
        category: string;
        clause: string | null;
      }>;
      missingClauses: string[];
      citationCount: number;
      truncated: boolean;
    }
  | {
      status: "NOT_FOUND" | "NO_TEXT" | "AI_ACCESS_OFF" | "FAILED";
      message: string;
    };

export type CaseTimelineToolResult =
  | {
      status: "TIMELINE_READY";
      analysisId: string;
      /** Case number, or null when the conversation has no case. */
      case: string | null;
      documentCount: number;
      eventCount: number;
      /** Earliest and latest dated events (YYYY-MM-DD, YYYY-MM or YYYY). */
      firstDate: string | null;
      lastDate: string | null;
      summary: string;
      openQuestions: string[];
      /** Titles of documents that were skipped, unreadable, or failed. */
      notRead: string[];
    }
  | { status: "NO_DOCUMENTS" | "FAILED"; message: string };

/** What detect_deadlines recognized and which rule applies. */
export interface DetectedDeadlineFacts {
  /** Document title. */
  document: string;
  /** Kind and title of the act ("Prvostepena presuda u parnici: Presuda … P 123/2026"). */
  act: string;
  /** Civil procedure kind, when it matters. */
  procedure: string | null;
  /** "Žalba protiv presude" */
  remedy: string;
  days: number;
  /** "ZPP čl. 367 st. 1" */
  legalBasis: string;
}

export interface ComputedDeadlineFacts extends DetectedDeadlineFacts {
  /** YYYY-MM-DD */
  serviceDate: string;
  serviceDateSource: "USER" | "DOCUMENT";
  /** YYYY-MM-DD; computed by the rules, never by the model. */
  dueDate: string;
  /** How the date was counted, in Serbian. */
  computation: string;
  warnings: string[];
}

export type DeadlineToolResult =
  | (ComputedDeadlineFacts & {
      status: "PROPOSED";
      pendingActionId: string;
    })
  | (ComputedDeadlineFacts & {
      status: "EXPIRED" | "NOT_PROPOSED";
      message: string;
    })
  | (DetectedDeadlineFacts & {
      status: "NEEDS_SERVICE_DATE";
      message: string;
      warnings: string[];
    })
  | {
      status: "NO_DEADLINE";
      document: string;
      act: string;
      reason: string;
      warnings: string[];
    }
  | {
      status: "NOT_FOUND" | "NO_TEXT" | "AI_ACCESS_OFF" | "INVALID" | "FAILED";
      message: string;
    };

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
  /** off: the user disabled AI access; read_document and search_documents refuse it. */
  aiAccess: "on" | "off";
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
      status: "NOT_FOUND" | "NO_TEXT" | "UNAVAILABLE" | "AI_ACCESS_OFF";
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
      /** Titles of documents skipped because AI access is off. */
      aiAccessOff: string[];
      matches: AssistantDocumentMatch[];
    }
  | { status: "NOT_FOUND" | "UNAVAILABLE" | "AI_ACCESS_OFF"; message: string };

export const CASE_DOCUMENT_SEARCH_DEFAULT_LIMIT = 8;
export const CASE_DOCUMENT_SEARCH_MAX_LIMIT = 12;

export interface AssistantCaseDocumentHit {
  /** 1..N in hit order. */
  n: number;
  ref: string;
  title: string;
  /** Chunk text of the document, Latin script. */
  text: string;
  /** Offsets of the chunk within the document text (for read_document). */
  charStart: number;
  charEnd: number;
  /** Cosine similarity, higher is closer. */
  score: number;
}

export type AssistantCaseDocumentSearch =
  | {
      status: "OK";
      query: string;
      hits: AssistantCaseDocumentHit[];
      /** Titles of readable documents whose content is not indexed yet. */
      notIndexed: string[];
      /** Titles of documents skipped because AI access is off. */
      aiAccessOff: string[];
    }
  | { status: "NO_DOCUMENTS"; message: string }
  | {
      status: "NOT_FOUND" | "UNAVAILABLE" | "AI_ACCESS_OFF";
      message: string;
    };

export interface AssistantDocumentFact {
  field: string;
  value: string;
  quote: string;
  confidence: number;
}

export interface AssistantDocumentSubject {
  ref: string;
  title: string;
  documentKind: DocumentKind;
  subjectKey: string;
  subjectType: string;
  subjectRole: string | null;
  facts: AssistantDocumentFact[];
}

export interface AssistantDocumentFactConflict {
  field: string;
  /** Name of the person or company the documents disagree about. */
  subject: string;
  values: Array<{ value: string; ref: string }>;
}

export type AssistantDocumentFacts =
  | {
      status: "OK";
      subjects: AssistantDocumentSubject[];
      conflicts: AssistantDocumentFactConflict[];
      notIndexed: string[];
      aiAccessOff: string[];
    }
  | {
      status: "NOT_FOUND" | "UNAVAILABLE" | "AI_ACCESS_OFF";
      message: string;
    };

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
  /** Semantic search over the indexed chunks of readable documents. */
  searchCaseDocuments(
    scope: AssistantTurnScope,
    args: { query: string; ref?: string; limit?: number },
  ): Promise<AssistantCaseDocumentSearch>;
  /** Extracted facts (persons, companies, decisions) of readable documents. */
  getDocumentFacts(
    scope: AssistantTurnScope,
    args: { ref?: string },
  ): Promise<AssistantDocumentFacts>;
  /** Drafts a document from the conversation (reversible: needs lawyer approval). */
  draftDocument(
    scope: AssistantTurnScope,
    args: {
      documentType: DraftDocumentType;
      note?: string;
      documentRefs?: string[];
    },
  ): Promise<DraftToolResult>;
  /** Reviews a contract document and stores the analysis (read-only otherwise). */
  reviewContract(
    scope: AssistantTurnScope,
    args: {
      documentRef: string;
      contractType: ContractReviewType;
      clientSide?: string;
      focus?: string;
    },
  ): Promise<ContractReviewToolResult>;
  /** Builds a sourced timeline of the case documents (stores an analysis only). */
  summarizeCaseDocuments(
    scope: AssistantTurnScope,
    args: { documentRefs?: string[]; focus?: string },
  ): Promise<CaseTimelineToolResult>;
  /**
   * Recognizes a served act, computes its response or remedy deadline by the
   * legal rules, and proposes it (confirm: a user must approve the card).
   */
  detectDeadlines(
    scope: AssistantTurnScope,
    args: { documentRef: string; serviceDate?: string },
  ): Promise<DeadlineToolResult>;
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
