import {
  ChatAttachmentSummary,
  ChatMessageResponse,
  ChatSessionSummary,
  DraftResultResponse,
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
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map((attachment) =>
      toAttachment(attachment),
    ),
  };
}

export function toJob(job: {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  correlationId: string;
  createdAt: Date;
}): WorkflowJobResponse {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    sessionId: job.sessionId,
    workflowName: job.workflowName,
    status: job.status,
    correlationId: job.correlationId,
    createdAt: job.createdAt.toISOString(),
  };
}

export function toDraft(draft: {
  id: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  messageId: string | null;
  briefResultId: string | null;
  documentText: string;
  warnings: string[];
  promptChars: number;
  truncated: boolean;
  model: string;
  errorCode: string | null;
  createdAt: Date;
}): DraftResultResponse {
  return {
    id: draft.id,
    jobId: draft.jobId,
    workspaceId: draft.workspaceId,
    sessionId: draft.sessionId,
    messageId: draft.messageId,
    briefResultId: draft.briefResultId,
    documentText: draft.documentText,
    warnings: draft.warnings,
    promptChars: draft.promptChars,
    truncated: draft.truncated,
    model: draft.model,
    errorCode: draft.errorCode,
    createdAt: draft.createdAt.toISOString(),
  };
}
