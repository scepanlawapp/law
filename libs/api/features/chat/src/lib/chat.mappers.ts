import {
  ChatAttachmentSummary,
  ChatMessageResponse,
  ChatSessionSummary,
  DraftResultResponse,
  WorkflowProgressStage,
  WorkflowJobResponse,
} from "@law/api-interfaces";

/**
 * Pure mapping helpers shared by `ChatService` (HTTP-facing) and
 * `WorkflowProcessor` (queue-facing) so both sides emit identical shapes.
 */

export function toSessionSummary(session: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title: string | null;
  status: "ACTIVE" | "ARCHIVED";
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ChatSessionSummary {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    createdByUserId: session.createdByUserId,
    title: session.title,
    status: session.status,
    isDeleted: session.isDeleted,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function toAttachment(attachment: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  extractionStatus?: ChatAttachmentSummary["extractionStatus"];
  sourceScript?: ChatAttachmentSummary["sourceScript"];
}): ChatAttachmentSummary {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    extractionStatus: attachment.extractionStatus,
    sourceScript: attachment.sourceScript ?? null,
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

export function toJob(job: {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  correlationId: string;
  output?: unknown;
  errorCode?: string | null;
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
    errorCode: job.errorCode ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
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
  messageId: string | null;
  briefResultId: string | null;
  documentText: string;
  finalDocumentText?: string | null;
  warnings: string[];
  missingFields?: string[];
  briefResult?: { missingFields: string[] } | null;
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
  return {
    id: draft.id,
    jobId: draft.jobId,
    workspaceId: draft.workspaceId,
    sessionId: draft.sessionId,
    messageId: draft.messageId,
    briefResultId: draft.briefResultId,
    documentText: draft.documentText,
    finalDocumentText: draft.finalDocumentText ?? null,
    warnings: draft.warnings,
    missingFields:
      draft.briefResult?.missingFields ?? draft.missingFields ?? [],
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
