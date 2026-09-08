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
  name?: string;
  avatarUrl?: string;
}

export type UserSettingsTheme = "SYSTEM" | "LIGHT" | "DARK";
export type UserSettingsLanguage = "SR" | "EN";
export type UserSettingsDateTimeFormat = "TWELVE_HOUR" | "TWENTY_FOUR_HOUR";

export interface UserSettingsProfile {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export interface UserSettingsPreferences {
  theme: UserSettingsTheme;
  language: UserSettingsLanguage;
  accentColor: string;
  workspaceNotifications: boolean;
  dateTimeFormat: UserSettingsDateTimeFormat;
  timeZone: string;
}

export interface UserSettingsResponse {
  profile: UserSettingsProfile;
  preferences: UserSettingsPreferences;
}

export interface UserSettingsUpdateRequest {
  profile?: Partial<UserSettingsProfile>;
  preferences?: Partial<UserSettingsPreferences>;
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
export type ChatAttachmentExtractionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "UNSUPPORTED";

export type ChatEventType =
  | "message.created"
  | "triage.started"
  | "triage.completed"
  | "job.queued"
  | "job.updated"
  | "error";

export interface ChatAttachmentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  extractionStatus?: ChatAttachmentExtractionStatus;
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

export type SortDirection = "asc" | "desc";

export interface PaginationSort {
  field: string;
  direction: SortDirection;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sort?: PaginationSort[];
  search?: string;
  from?: string;
  to?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  sort: PaginationSort[];
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export type ChatSessionListResponse = PaginatedResponse<ChatSessionSummary>;

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

export type BriefJobType = "lawsuit" | "contract" | "other";

export interface BriefParty {
  name: string | null;
  address: string | null;
}

export interface BriefResult {
  jobType: BriefJobType | null;
  plaintiff: BriefParty;
  defendant: BriefParty;
  competentCourt: string | null;
  claimValue: string | null;
  legalBasis: string[];
  factualDescription: string | null;
  evidence: string[];
  reliefSought: string | null;
  missingFields: string[];
  confidence: number;
  warnings: string[];
}

export interface BriefExtractionResultResponse {
  id: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  messageId: string | null;
  brief: BriefResult;
  confidence: number | null;
  missingFields: string[];
  promptChars: number;
  truncated: boolean;
  model: string;
  errorCode?: string | null;
  createdAt: string;
}
