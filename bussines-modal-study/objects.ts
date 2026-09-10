// ============================================================
// COMMON
// ============================================================

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

export interface Address {
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
  postalCode?: string | null;
  municipality?: string | null;
  country?: string | null;
}

// ============================================================
// USER / WORKSPACE
// ============================================================

export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LAWYER = "LAWYER",
  MEMBER = "MEMBER",
}

export type UserStatus = "INVITED" | "ACTIVE" | "DISABLED";

export interface AuthUser {
  id: string;
  email: string;
  status: UserStatus;
  name?: string;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
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

// ============================================================
// AUTH REQUESTS
// ============================================================

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

// ============================================================
// USER SETTINGS
// ============================================================

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

// ============================================================
// CHAT
// ============================================================

export type ChatSessionStatus = "ACTIVE" | "ARCHIVED";

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type ChatMessageStatus = "PENDING" | "COMPLETED" | "FAILED";

export type ChatContextType =
  | "GENERAL"
  | "PRACTICE"
  | "RESEARCH"
  | "CLIENT"
  | "CASE"
  | "DOCUMENT";

export type ChatEventType =
  | "message.created"
  | "triage.started"
  | "triage.completed"
  | "job.queued"
  | "job.updated"
  | "session.title.updated"
  | "session.deleted"
  | "error";

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

export interface ChatContext {
  id: string;
  sessionId: string;

  contextType: ChatContextType;

  clientId?: string | null;
  caseId?: string | null;
  documentId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;

  workspaceId: string;
  createdByUserId: string;

  title?: string | null;
  status: ChatSessionStatus;

  contextType: ChatContextType;

  clientId?: string | null;
  caseId?: string | null;
  documentId?: string | null;

  isDeleted: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;

  workspaceId: string;
  createdByUserId: string;

  title?: string | null;
  status: ChatSessionStatus;

  contextType: ChatContextType;

  clientId?: string | null;
  caseId?: string | null;
  documentId?: string | null;

  isDeleted: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;

  sessionId: string;

  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;

  triageDecision?: TriageDecision | null;

  correlationId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  id: string;

  messageId: string;

  originalName: string;
  mimeType: string;
  sizeBytes: number;

  extractionStatus?: ChatAttachmentExtractionStatus;
  sourceScript?: ChatAttachmentSourceScript | null;

  storageKey?: string | null;

  createdAt: string;
  updatedAt: string;
}

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

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessageResponse[];
}

export interface ChatSessionCreateRequest {
  workspaceId: string;
  title?: string;
  contextType?: ChatContextType;

  clientId?: string;
  caseId?: string;
  documentId?: string;
}

export interface ChatSendMessageResponse {
  userMessage: ChatMessageResponse;
  correlationId: string;
}

export interface ChatStreamEvent {
  type: ChatEventType;

  sessionId: string;
  createdAt: string;

  message?: ChatMessageResponse;
  job?: WorkflowJobResponse;

  decision?: TriageDecision;
  reason?: string;

  title?: string | null;

  error?: string;
}

export type ChatSessionListResponse = PaginatedResponse<ChatSessionSummary>;

// ============================================================
// TRIAGE / PORTIR
// ============================================================

export type TriageDecision = "LEGAL" | "NON_LEGAL" | "UNCLEAR";

export type ChatIntent =
  | "GENERAL"
  | "PRACTICE"
  | "RESEARCH"
  | "DOCUMENT_ANALYSIS"
  | "EXISTING_CASE"
  | "NEW_CASE"
  | "CLIENT"
  | "OTHER";

export interface TriageResult {
  id: string;

  sessionId: string;
  messageId: string;

  decision: TriageDecision;
  intent: ChatIntent;

  confidence: number;

  reason?: string | null;

  caseId?: string | null;
  clientId?: string | null;

  requiresConfirmation: boolean;

  createdAt: string;
}

// ============================================================
// WORKFLOW
// ============================================================

export type WorkflowJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface WorkflowJob {
  id: string;

  workspaceId: string;
  sessionId: string;

  workflowName: string;
  status: WorkflowJobStatus;

  correlationId: string;

  startedAt?: string | null;
  completedAt?: string | null;

  errorCode?: string | null;
  errorMessage?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface WorkflowJobResponse {
  id: string;

  workspaceId: string;
  sessionId: string;

  workflowName: string;
  status: WorkflowJobStatus;

  correlationId: string;

  startedAt?: string | null;
  completedAt?: string | null;

  errorCode?: string | null;
  errorMessage?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// LEGAL MATTER / BRIEF
// ============================================================

export type LegalMatterType =
  | "LAWSUIT"
  | "APPEAL"
  | "CONTRACT"
  | "LEGAL_OPINION"
  | "EMPLOYMENT"
  | "ENFORCEMENT"
  | "CRIMINAL"
  | "FAMILY"
  | "PROPERTY"
  | "OTHER";

export type BriefJobType = "lawsuit" | "contract" | "other";

export interface BriefParty {
  name: string | null;

  type?: "INDIVIDUAL" | "COMPANY" | "ORGANIZATION" | "OTHER";

  role?: string | null;

  address: Address | null;

  email?: string | null;
  phone?: string | null;
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

export interface BriefExtractionResult {
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

// ============================================================
// MATTER CANDIDATE
// ============================================================

export type MatterCandidateStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "CONVERTED";

export type PartyCandidateType =
  | "INDIVIDUAL"
  | "COMPANY"
  | "ORGANIZATION"
  | "OTHER";

export interface PartyCandidate {
  name: string | null;

  type?: PartyCandidateType;

  role?: string | null;

  address?: Address | null;

  email?: string | null;
  phone?: string | null;
}

export interface MatterCandidate {
  id: string;

  workspaceId: string;
  sessionId: string;

  clientCandidate?: PartyCandidate | null;

  matterType?: LegalMatterType | null;

  title?: string | null;
  description?: string | null;

  parties: PartyCandidate[];

  confidence: number;

  missingInformation: string[];
  warnings: string[];

  status: MatterCandidateStatus;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CLIENT
// ============================================================

export type ClientType = "INDIVIDUAL" | "COMPANY" | "ORGANIZATION" | "OTHER";

export type ClientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface Client {
  id: string;

  workspaceId: string;

  type: ClientType;
  status: ClientStatus;

  displayName: string;

  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;

  email?: string | null;
  phone?: string | null;

  address?: Address | null;

  taxNumber?: string | null;
  registrationNumber?: string | null;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CASE
// ============================================================

export type CaseStatus =
  | "DRAFT"
  | "ACTIVE"
  | "ON_HOLD"
  | "WON"
  | "LOST"
  | "SETTLED"
  | "CLOSED"
  | "ARCHIVED";

export type CasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type CaseStage =
  | "PRE_LITIGATION"
  | "FIRST_INSTANCE"
  | "APPEAL"
  | "EXTRAORDINARY_REMEDY"
  | "ENFORCEMENT"
  | "SETTLEMENT"
  | "OTHER";

export interface Case {
  id: string;

  workspaceId: string;

  caseNumber: string;
  title: string;

  description?: string | null;

  status: CaseStatus;
  priority: CasePriority;
  stage: CaseStage;

  clientId?: string | null;

  courtId?: string | null;
  courtCaseNumber?: string | null;

  responsibleLawyerId: string;

  openedAt: string;
  closedAt?: string | null;

  filingDate?: string | null;
  judgmentDate?: string | null;

  aiSummary?: string | null;
  aiSummaryUpdatedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CASE PARTY
// ============================================================

export type CasePartyRole =
  | "CLIENT"
  | "PLAINTIFF"
  | "DEFENDANT"
  | "CLAIMANT"
  | "RESPONDENT"
  | "APPELLANT"
  | "APPELLEE"
  | "WITNESS"
  | "EXPERT"
  | "REPRESENTATIVE"
  | "AUTHORITY"
  | "OTHER";

export type CasePartySide = "OUR_SIDE" | "OPPOSING_SIDE" | "NEUTRAL" | "OTHER";

export interface CaseParty {
  id: string;

  caseId: string;

  clientId?: string | null;

  name: string;

  role: CasePartyRole;
  side: CasePartySide;

  email?: string | null;
  phone?: string | null;

  address?: Address | null;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CASE MEMBERS
// ============================================================

export type CaseMemberRole =
  | "RESPONSIBLE_LAWYER"
  | "LAWYER"
  | "ASSISTANT"
  | "PARALEGAL"
  | "OBSERVER";

export interface CaseMember {
  id: string;

  caseId: string;
  userId: string;

  role: CaseMemberRole;

  createdAt: string;
}

// ============================================================
// COURT
// ============================================================

export interface Court {
  id: string;

  workspaceId?: string | null;

  name: string;
  type?: string | null;

  address?: Address | null;

  phone?: string | null;
  email?: string | null;
  website?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// HEARING
// ============================================================

export type HearingType =
  | "PRELIMINARY"
  | "MAIN"
  | "APPEAL"
  | "ENFORCEMENT"
  | "OTHER";

export type HearingStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "POSTPONED"
  | "CANCELLED";

export interface Hearing {
  id: string;

  workspaceId: string;

  caseId: string;

  type: HearingType;
  status: HearingStatus;

  title?: string | null;

  startsAt: string;
  endsAt?: string | null;

  courtId?: string | null;
  courtroom?: string | null;

  judgeName?: string | null;

  description?: string | null;
  result?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DOCUMENT
// ============================================================

export type DocumentStatus =
  | "UPLOADING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "ARCHIVED";

export type DocumentType =
  | "CONTRACT"
  | "JUDGMENT"
  | "LAWSUIT"
  | "APPEAL"
  | "EVIDENCE"
  | "CORRESPONDENCE"
  | "COURT_DOCUMENT"
  | "OTHER";

export interface Document {
  id: string;

  workspaceId: string;

  name: string;
  originalFileName: string;

  type: DocumentType;
  status: DocumentStatus;

  mimeType: string;
  sizeBytes: number;

  storageKey: string;

  uploadedById: string;

  createdAt: string;
  updatedAt: string;
}

export interface CaseDocument {
  id: string;

  caseId: string;
  documentId: string;

  category?: string | null;

  isPrimary?: boolean;

  createdAt: string;
}

// ============================================================
// DOCUMENT AI ANALYSIS
// ============================================================

export interface DocumentAnalysis {
  id: string;

  documentId: string;

  extractedText?: string | null;

  extractedInformation?: Record<string, unknown> | null;

  summary?: string | null;

  confidence?: number | null;

  model?: string | null;
  modelVersion?: string | null;

  analyzedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DRAFT
// ============================================================

export interface DraftResult {
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

  errorCode?: string | null;

  createdAt: string;

  script?: DocumentScript;
}

export interface DraftResultResponse {
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

  errorCode?: string | null;

  createdAt: string;

  script?: DocumentScript;
}

// ============================================================
// CASE AI SUMMARY
// ============================================================

export interface CaseAISummary {
  id: string;

  caseId: string;

  summary: string;

  currentSituation?: string | null;
  currentStage?: string | null;

  nextActions: string[];

  outstandingIssues: string[];

  risks: string[];

  missingInformation: string[];

  generatedAt: string;

  model?: string | null;
  modelVersion?: string | null;
}

// ============================================================
// AI RECOMMENDATIONS
// ============================================================

export type AIRecommendationType =
  | "TASK"
  | "DEADLINE"
  | "DOCUMENT"
  | "MISSING_INFORMATION"
  | "RISK"
  | "GENERAL";

export type AIRecommendationStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface AIRecommendation {
  id: string;

  workspaceId: string;

  caseId?: string | null;

  type: AIRecommendationType;
  status: AIRecommendationStatus;

  title: string;
  description: string;

  confidence?: number | null;

  sourceConversationId?: string | null;
  sourceDocumentId?: string | null;

  createdAt: string;
  resolvedAt?: string | null;
}

// ============================================================
// ACTIVITY
// ============================================================

export type ActivityType =
  | "CALL"
  | "EMAIL"
  | "MEETING"
  | "COURT_APPEARANCE"
  | "DOCUMENT_REVIEW"
  | "DOCUMENT_PREPARATION"
  | "LEGAL_RESEARCH"
  | "CLIENT_COMMUNICATION"
  | "AI_ANALYSIS"
  | "NOTE"
  | "OTHER";

export interface Activity {
  id: string;

  workspaceId: string;

  type: ActivityType;

  title: string;
  description?: string | null;

  userId: string;

  caseId?: string | null;
  clientId?: string | null;
  documentId?: string | null;

  startedAt?: string | null;
  endedAt?: string | null;

  durationMinutes?: number | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// TASK
// ============================================================

export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface Task {
  id: string;

  workspaceId: string;

  title: string;
  description?: string | null;

  status: TaskStatus;
  priority: TaskPriority;

  assignedToId?: string | null;
  createdById: string;

  caseId?: string | null;
  clientId?: string | null;

  dueDate?: string | null;
  completedAt?: string | null;

  parentTaskId?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DEADLINE
// ============================================================

export type DeadlineType = "COURT" | "LEGAL" | "INTERNAL" | "CLIENT" | "OTHER";

export type DeadlineStatus = "UPCOMING" | "COMPLETED" | "MISSED" | "CANCELLED";

export interface Deadline {
  id: string;

  workspaceId: string;

  title: string;
  description?: string | null;

  type: DeadlineType;
  status: DeadlineStatus;

  caseId?: string | null;
  clientId?: string | null;

  dueAt: string;

  responsibleUserId?: string | null;

  sourceDocumentId?: string | null;

  completedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CASE NOTES
// ============================================================

export type NoteVisibility = "PRIVATE" | "OFFICE" | "CASE";

export interface CaseNote {
  id: string;

  caseId: string;

  title?: string | null;
  content: string;

  visibility: NoteVisibility;

  createdById: string;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CASE DETAIL
// ============================================================

export interface CaseDetail extends Case {
  client?: Client | null;

  parties: CaseParty[];

  members: CaseMember[];

  activities: Activity[];

  tasks: Task[];

  deadlines: Deadline[];

  hearings: Hearing[];

  documents: CaseDocument[];

  notes: CaseNote[];

  aiSummary?: CaseAISummary | null;
}

// ============================================================
// ENUM / TYPE REFERENCE
// ============================================================

export type ChatSessionListResponse = PaginatedResponse<ChatSessionSummary>;
