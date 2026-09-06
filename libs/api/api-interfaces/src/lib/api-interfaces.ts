export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LAWYER = "LAWYER",
  MEMBER = "MEMBER",
}

export interface AuthUser {
  id: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
}

export interface AuthWorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export interface AuthSessionResponse {
  user: AuthUser;
  memberships: AuthWorkspaceMembership[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface InvitationAcceptRequest {
  token: string;
  password: string;
}

export interface InvitationCreateRequest {
  email: string;
  workspaceId: string;
}

export interface PasswordForgotRequest {
  email: string;
}

export interface PasswordResetRequest {
  token: string;
  password: string;
}

export type ChatSessionStatus = "ACTIVE" | "ARCHIVED";
export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type ChatMessageStatus = "PENDING" | "COMPLETED" | "FAILED";
export type TriageDecision = "LEGAL" | "NON_LEGAL" | "UNCLEAR";
export type WorkflowJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type ChatEventType =
  | "message.created"
  | "triage.started"
  | "triage.completed"
  | "job.queued"
  | "error";

export interface ChatAttachmentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ChatMessageResponse {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  triageDecision?: TriageDecision | null;
  correlationId?: string | null;
  createdAt: string;
  attachments: ChatAttachmentSummary[];
}

export interface ChatSessionSummary {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title?: string | null;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessageResponse[];
}

export interface ChatSessionCreateRequest {
  workspaceId: string;
  title?: string;
}

export interface ChatSendMessageResponse {
  userMessage: ChatMessageResponse;
  correlationId: string;
}

export interface WorkflowJobResponse {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: string;
  status: WorkflowJobStatus;
  correlationId: string;
  createdAt: string;
}

export interface ChatStreamEvent {
  type: ChatEventType;
  sessionId: string;
  createdAt: string;
  message?: ChatMessageResponse;
  job?: WorkflowJobResponse;
  decision?: TriageDecision;
  reason?: string;
  error?: string;
}
