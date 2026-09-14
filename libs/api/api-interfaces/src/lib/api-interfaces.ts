export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LAWYER = "LAWYER",
  MEMBER = "MEMBER",
}

export type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED";

export interface TenantSummary {
  id: string;
  key: string;
  name: string;
  schemaName: string;
  status: TenantStatus;
  storagePrefix?: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  tenantId?: string | null;
  role?: WorkspaceRole;
}

export interface TenantContextPayload {
  userId: string;
  workspaceId: string;
  tenantId: string;
  schemaName: string;
  role: WorkspaceRole;
  storagePrefix: string;
}

export interface AuthUser {
  id: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  name?: string;
  avatarUrl?: string;
}

export type UserSettingsTheme =
  | "MIDNIGHT"
  | "DEEP_NAVY"
  | "CHARCOAL"
  | "DARK_TEAL"
  | "BURGUNDY"
  | "IVORY";
export type UserSettingsAccent =
  | "GOLD"
  | "EMERALD"
  | "ROYAL_BLUE"
  | "COPPER"
  | "ICE_BLUE"
  | "BURGUNDY"
  | "PURPLE"
  | "IVORY";
export type UserSettingsFinish =
  | "SOLID"
  | "METALLIC"
  | "BRUSHED"
  | "MATTE"
  | "LUXURY";
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
  accentColor: UserSettingsAccent;
  finish: UserSettingsFinish;
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
  activeWorkspaceId: string | null;
  activeTenantId: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ActiveWorkspaceRequest {
  workspaceId: string;
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
export type ChatAttachmentSourceScript =
  | "LATIN"
  | "CYRILLIC"
  | "MIXED"
  | "NONE";
export type DocumentScript = "latin" | "cyrillic";
export type DraftApprovalStatus =
  | "DRAFT"
  | "READY_FOR_SIGNOFF"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED";

export type ChatEventType =
  | "message.created"
  | "triage.started"
  | "triage.completed"
  | "job.queued"
  | "job.updated"
  | "draft.updated"
  | "session.title.updated"
  | "session.deleted"
  | "error";

export interface ChatAttachmentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  extractionStatus?: ChatAttachmentExtractionStatus;
  sourceScript?: ChatAttachmentSourceScript | null;
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
  isDeleted: boolean;
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
  draft?: DraftResultResponse;
  decision?: TriageDecision;
  reason?: string;
  title?: string | null;
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

export interface DraftResultResponse {
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
  promptChars: number;
  truncated: boolean;
  model: string;
  approvalStatus?: DraftApprovalStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  previousDraftId?: string | null;
  errorCode?: string | null;
  createdAt: string;
  // Script of documentText in this response; stored value is always Latin.
  script?: DocumentScript;
}

export type ClientType = "INDIVIDUAL" | "ORGANIZATION";
export type ClientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type CaseStatus = "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED" | "ARCHIVED";
export type CasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ActivityType =
  | "NOTE"
  | "PHONE_CALL"
  | "MEETING"
  | "EMAIL"
  | "OTHER";
export type ActivitySource = "MANUAL" | "SYSTEM" | "AI";

export interface ReferenceSummary {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface ClientSummary {
  id: string;
  clientNumber: string;
  type: ClientType;
  displayName: string;
  status: ClientStatus;
  email: string | null;
  phone: string | null;
  responsibleUserId: string | null;
  activeCaseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDetail extends ClientSummary {
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  website: string | null;
  preferredLanguage: string | null;
  notes: string | null;
  customFields: Record<string, unknown> | null;
  tags: ReferenceSummary[];
}

export type ClientListResponse = PaginatedResponse<ClientSummary>;

export interface CaseSummary {
  id: string;
  caseNumber: string;
  clientId: string;
  name: string;
  status: CaseStatus;
  priority: CasePriority;
  responsibleUserId: string;
  openedDate: string | null;
  closedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseDetail extends CaseSummary {
  description: string | null;
  caseTypeId: string | null;
  practiceAreaId: string | null;
  closingNote: string | null;
  externalReference: string | null;
  confidentialityLevel: string | null;
  customFields: Record<string, unknown> | null;
  tags: ReferenceSummary[];
}

export type CaseListResponse = PaginatedResponse<CaseSummary>;
