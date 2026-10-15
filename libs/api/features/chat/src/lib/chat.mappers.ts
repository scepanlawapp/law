import {
  AgentToolCallSummary,
  PendingActionSummary,
  ChatAttachmentSummary,
  ChatMessageResponse,
  AssistantDeadlineRequest,
  AssistantEventRequest,
  AssistantFormPrefill,
  CreateWorkEntryRequest,
  PendingActionResultEntityType,
  TaskRequest,
  ChatSessionSummary,
  CaseTimelineAnalysis,
  CaseTimelineResult,
  ContractReviewAnalysis,
  ContractReviewResult,
  DocumentAnalysisResponse,
  DraftResultResponse,
  LegalCitationResponse,
  WorkflowProgressStage,
  WorkflowJobResponse,
  DocumentAiStatus,
  isDraftDocumentType,
} from "@law/api-interfaces";
import { isContractReviewType } from "@law/contract-review";
import {
  DEFAULT_DOCUMENT_TYPE,
  getDocumentType,
  missingFieldKeys,
  normalizeMissingFields,
} from "@law/brief-extraction";
import { documentAiStatus } from "@law/document-ingestion";
import { describeToolCall, toolResultCount } from "@law/mastra";

/**
 * Pure mapping helpers shared by `ChatService` (HTTP-facing) and
 * `WorkflowProcessor` (queue-facing) so both sides emit identical shapes.
 */

/** "First Last", falling back to the e-mail address. */
export function userDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email
  );
}

export function toSessionSummary(session: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  caseId?: string | null;
  title: string | null;
  status: "ACTIVE" | "ARCHIVED";
  permissionMode?: "MANUAL" | "ASK" | "AUTO" | null;
  isDeleted: boolean;
  pinnedAt?: Date | null;
  createdBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  case?: {
    id: string;
    caseNumber: string;
    name: string;
    clientId: string;
    client?: { displayName: string } | null;
  } | null;
}): ChatSessionSummary {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    createdByUserId: session.createdByUserId,
    caseId: session.caseId ?? null,
    case: session.case
      ? {
          id: session.case.id,
          caseNumber: session.case.caseNumber,
          name: session.case.name,
          clientId: session.case.clientId,
          clientDisplayName: session.case.client?.displayName ?? null,
        }
      : null,
    title: session.title,
    status: session.status,
    isDeleted: session.isDeleted,
    pinnedAt: session.pinnedAt?.toISOString() ?? null,
    permissionMode: session.permissionMode ?? null,
    ...(session.createdBy
      ? {
          createdBy: {
            id: session.createdBy.id,
            displayName: userDisplayName(session.createdBy),
          },
        }
      : {}),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Include for every query that builds attachment summaries: one join brings
 * the shared content status along, so mapping never queries per attachment.
 */
export const ATTACHMENT_WITH_CONTENT = {
  include: {
    content: { select: { status: true } },
    // The document the attachment was filed as: its AI access decides "OFF".
    document: { select: { aiAccess: true, archivedAt: true } },
  },
} as const;

/** Attachments plus what the assistant policy needs to decide whether it may read them. */
export const ATTACHMENT_WITH_ACCESS = ATTACHMENT_WITH_CONTENT;

/**
 * What the chat chip shows for an attachment: "OFF" once it was filed as a
 * document the assistant may not read (AI access off or archived), otherwise
 * the status of the shared content.
 */
export function attachmentAiStatus(attachment: {
  content?: { status: string } | null;
  document?: { aiAccess: boolean; archivedAt: Date | null } | null;
}): DocumentAiStatus {
  const document = attachment.document;
  return documentAiStatus(
    !document || (document.aiAccess && !document.archivedAt),
    attachment.content,
  );
}

export function toAttachment(attachment: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  extractionStatus?: ChatAttachmentSummary["extractionStatus"];
  sourceScript?: ChatAttachmentSummary["sourceScript"];
  content?: { status: string } | null;
  document?: { aiAccess: boolean; archivedAt: Date | null } | null;
}): ChatAttachmentSummary {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    extractionStatus: attachment.extractionStatus,
    sourceScript: attachment.sourceScript ?? null,
    // Unfiled attachments are always AI-readable; no content row yet is pending.
    aiStatus: attachmentAiStatus(attachment),
  };
}

export function toMessage(message: {
  id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  triageDecision?: "LEGAL" | "NON_LEGAL" | "UNCLEAR" | null;
  correlationId?: string | null;
  metadata?: unknown;
  createdAt: Date;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
    content?: { status: string } | null;
    document?: { aiAccess: boolean; archivedAt: Date | null } | null;
  }>;
}): ChatMessageResponse {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    status: message.status,
    triageDecision: message.triageDecision,
    correlationId: message.correlationId,
    feedback: feedbackFromMetadata(message.metadata),
    outcome: outcomeFromMetadata(message.metadata),
    citations: citationsFromMetadata(message.metadata),
    pendingActionIds: pendingActionIdsFromMetadata(message.metadata),
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map((attachment) =>
      toAttachment(attachment),
    ),
  };
}

function outcomeFromMetadata(
  metadata: unknown,
): ChatMessageResponse["outcome"] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const outcome = (metadata as Record<string, unknown>)["outcome"];
  switch (outcome) {
    case "ANSWER":
    case "DRAFT_READY":
    case "DRAFT_UNSUPPORTED":
    case "CONTEXT_REQUIRED":
      return outcome;
    default:
      return null;
  }
}

function feedbackFromMetadata(
  metadata: unknown,
): ChatMessageResponse["feedback"] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const feedback = (metadata as Record<string, unknown>)["feedback"];
  return feedback === "POSITIVE" || feedback === "NEGATIVE" ? feedback : null;
}

function pendingActionIdsFromMetadata(metadata: unknown): string[] | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const ids = (metadata as Record<string, unknown>)["pendingActionIds"];
  return Array.isArray(ids) && ids.every((id) => typeof id === "string")
    ? (ids as string[])
    : undefined;
}

function citationsFromMetadata(
  metadata: unknown,
): LegalCitationResponse[] | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const citations = (metadata as Record<string, unknown>)["citations"];
  return Array.isArray(citations)
    ? (citations as LegalCitationResponse[])
    : undefined;
}

export function toJob(job: {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: string;
  status: WorkflowJobResponse["status"];
  correlationId: string;
  output?: unknown;
  errorCode?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowJobResponse {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    sessionId: job.sessionId,
    workflowName: job.workflowName as WorkflowJobResponse["workflowName"],
    status: job.status,
    correlationId: job.correlationId,
    progressStage: progressStageFromOutput(job.output),
    briefResultId: briefResultIdFromOutput(job.output),
    errorCode: job.errorCode ?? null,
    model: job.model ?? null,
    inputTokens: job.inputTokens ?? null,
    outputTokens: job.outputTokens ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toToolCall(
  call: {
    id: string;
    jobId: string;
    toolName: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    input?: unknown;
    output?: unknown;
    durationMs?: number | null;
    startedAt: Date;
    finishedAt?: Date | null;
  },
  correlationId: string,
): AgentToolCallSummary {
  return {
    id: call.id,
    jobId: call.jobId,
    correlationId,
    toolName: call.toolName,
    status: call.status,
    label: describeToolCall(call.toolName, call.input),
    resultCount:
      call.status === "COMPLETED"
        ? toolResultCount(call.toolName, call.output)
        : null,
    durationMs: call.durationMs ?? null,
    startedAt: call.startedAt.toISOString(),
    finishedAt: call.finishedAt?.toISOString() ?? null,
  };
}

function briefResultIdFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const briefResultId = (output as Record<string, unknown>)["briefResultId"];
  return typeof briefResultId === "string" ? briefResultId : null;
}

function progressStageFromOutput(
  output: unknown,
): WorkflowProgressStage | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const progressStage = (output as Record<string, unknown>)["progressStage"];
  switch (progressStage) {
    case "UNDERSTANDING_REQUEST":
    case "READING_ATTACHMENTS":
    case "EXTRACTING_FACTS":
    case "PREPARING_ANSWER":
    case "PREPARING_DRAFT":
    case "SAVING_FOR_REVIEW":
      return progressStage;
    default:
      return null;
  }
}

export function toDraft(draft: {
  id: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  caseId?: string | null;
  messageId: string | null;
  briefResultId: string | null;
  documentType?: string | null;
  documentText: string;
  finalDocumentText?: string | null;
  warnings: string[];
  missingFields?: unknown;
  briefResult?: { missingFields: unknown } | null;
  citations?: Array<{
    marker: number;
    articleNumber: string | null;
    sourceTitle: string;
    sourceUrl: string;
    snippet: string;
    score: number;
  }>;
  promptChars: number;
  truncated: boolean;
  model: string;
  approvalStatus?:
    | "DRAFT"
    | "READY_FOR_SIGNOFF"
    | "APPROVED"
    | "REJECTED"
    | "CHANGES_REQUESTED"
    | null;
  reviewedByUserId?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  previousDraftId?: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt?: Date;
}): DraftResultResponse {
  const documentType = isDraftDocumentType(draft.documentType)
    ? draft.documentType
    : DEFAULT_DOCUMENT_TYPE;
  return {
    id: draft.id,
    jobId: draft.jobId,
    workspaceId: draft.workspaceId,
    sessionId: draft.sessionId,
    caseId: draft.caseId ?? null,
    messageId: draft.messageId,
    briefResultId: draft.briefResultId,
    documentType,
    documentText: draft.documentText,
    finalDocumentText: draft.finalDocumentText ?? null,
    warnings: draft.warnings,
    missingFields: normalizeMissingFields(
      draft.briefResult?.missingFields ?? draft.missingFields,
      new Set(missingFieldKeys(getDocumentType(documentType))),
    ),
    citations: (draft.citations ?? [])
      .slice()
      .sort((left, right) => left.marker - right.marker)
      .map((citation) => ({
        marker: citation.marker,
        articleNumber: citation.articleNumber,
        sourceTitle: citation.sourceTitle,
        sourceUrl: citation.sourceUrl,
        snippet: citation.snippet,
        score: citation.score,
      })),
    promptChars: draft.promptChars,
    truncated: draft.truncated,
    model: draft.model,
    approvalStatus: draft.approvalStatus ?? "READY_FOR_SIGNOFF",
    reviewedByUserId: draft.reviewedByUserId ?? null,
    reviewedAt: draft.reviewedAt ? draft.reviewedAt.toISOString() : null,
    reviewNote: draft.reviewNote ?? null,
    previousDraftId: draft.previousDraftId ?? null,
    errorCode: draft.errorCode,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt?.toISOString(),
  };
}

export function toPendingAction(action: {
  id: string;
  jobId: string;
  correlationId: string;
  actionType: string;
  summary: string;
  details: string[];
  status: PendingActionSummary["status"];
  mode?: PendingActionSummary["mode"];
  payload?: unknown;
  result?: unknown;
  errorMessage?: string | null;
  expiresAt: Date;
  decidedAt?: Date | null;
  createdAt: Date;
}): PendingActionSummary {
  const mode = action.mode ?? "CARD";
  const result =
    action.result &&
    typeof action.result === "object" &&
    !Array.isArray(action.result)
      ? (action.result as Record<string, unknown>)
      : null;
  return {
    id: action.id,
    jobId: action.jobId,
    correlationId: action.correlationId,
    actionType: action.actionType as PendingActionSummary["actionType"],
    summary: action.summary,
    details: action.details,
    status: action.status,
    mode,
    // The form is prefilled from the proposal; only FORM actions need it.
    prefill: mode === "FORM" ? formPrefill(action.actionType, action.payload) : null,
    ...resultEntity(result),
    resultMessage:
      typeof result?.["message"] === "string" ? result["message"] : null,
    errorMessage: action.errorMessage ?? null,
    expiresAt: action.expiresAt.toISOString(),
    decidedAt: action.decidedAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
  };
}

/** Dialog values for a FORM action; the payload already has the dialog's request shape. */
function formPrefill(
  actionType: string,
  payload: unknown,
): AssistantFormPrefill | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  switch (actionType) {
    case "create_event":
      return { kind: "event", request: record as unknown as AssistantEventRequest };
    case "reschedule_event": {
      const { eventId, ...request } = record;
      return {
        kind: "event",
        eventId: String(eventId),
        request: request as unknown as AssistantEventRequest,
      };
    }
    case "create_task":
      return { kind: "task", request: record as unknown as TaskRequest };
    case "create_deadline":
      return {
        kind: "deadline",
        request: record as unknown as AssistantDeadlineRequest,
      };
    case "log_work_entry":
      return {
        kind: "work_entry",
        request: record as unknown as CreateWorkEntryRequest,
      };
    default:
      return null;
  }
}

const RESULT_ENTITY_KEYS: Array<[string, PendingActionResultEntityType]> = [
  ["eventId", "EVENT"],
  ["taskId", "TASK"],
  ["deadlineId", "DEADLINE"],
  ["workEntryId", "WORK_ENTRY"],
  ["caseId", "CASE"],
];

/** The record an executed action created or changed (event, task, deadline, …). */
function resultEntity(result: Record<string, unknown> | null): {
  resultEntityId: string | null;
  resultEntityType: PendingActionResultEntityType | null;
} {
  for (const [key, type] of RESULT_ENTITY_KEYS) {
    const id = result?.[key];
    if (typeof id === "string") return { resultEntityId: id, resultEntityType: type };
  }
  return { resultEntityId: null, resultEntityType: null };
}

type AnalysisRow = {
  id: string;
  sessionId: string;
  caseId: string | null;
  kind: string;
  documentRef: string;
  documentTitle: string;
  contractType: string | null;
  clientSide: string | null;
  result: unknown;
  citations: unknown;
  truncated: boolean;
  model: string;
  createdAt: Date;
};

function analysisBase(row: AnalysisRow) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    caseId: row.caseId,
    documentRef: row.documentRef,
    documentTitle: row.documentTitle,
    citations: Array.isArray(row.citations)
      ? (row.citations as LegalCitationResponse[])
      : [],
    truncated: row.truncated,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContractReview(row: AnalysisRow): ContractReviewAnalysis {
  const result = (row.result ?? {}) as Partial<ContractReviewResult>;
  return {
    ...analysisBase(row),
    kind: "CONTRACT_REVIEW",
    contractType: isContractReviewType(row.contractType)
      ? row.contractType
      : "OTHER_CONTRACT",
    clientSide: row.clientSide,
    result: {
      summary: result.summary ?? "",
      keyTerms: result.keyTerms ?? [],
      issues: result.issues ?? [],
      missingClauses: result.missingClauses ?? [],
      warnings: result.warnings ?? [],
    },
  };
}

export function toCaseTimeline(row: AnalysisRow): CaseTimelineAnalysis {
  const result = (row.result ?? {}) as Partial<CaseTimelineResult>;
  return {
    ...analysisBase(row),
    kind: "CASE_TIMELINE",
    result: {
      summary: result.summary ?? "",
      events: result.events ?? [],
      openQuestions: result.openQuestions ?? [],
      sources: result.sources ?? [],
      warnings: result.warnings ?? [],
    },
  };
}

export function toAnalysis(row: AnalysisRow): DocumentAnalysisResponse {
  return row.kind === "CASE_TIMELINE"
    ? toCaseTimeline(row)
    : toContractReview(row);
}
