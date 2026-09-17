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

export const CASE_NUMBER_FORMATS = [
  "YYYY-N",
  "YYYY-NNNNN",
  "CYYYY/NNN",
  "YYYYC-NN",
  "PNNNNN-YY",
] as const;

export type CaseNumberFormat = (typeof CASE_NUMBER_FORMATS)[number];

export interface ActiveWorkspace {
  id: string;
  organizationName: string;
  owner: AuthUser;
  role: WorkspaceRole;
  caseNumberFormat: CaseNumberFormat;
  caseNumberFormatOptions: ReadonlyArray<CaseNumberFormat>;
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
export type ChatMessageFeedback = "POSITIVE" | "NEGATIVE";
export type ChatMessageOutcome =
  | "ANSWER"
  | "DRAFT_READY"
  | "DRAFT_UNSUPPORTED"
  | "CONTEXT_REQUIRED";
export type TriageDecision = "LEGAL" | "NON_LEGAL" | "UNCLEAR";
export type AssistantIntent = "ANSWER" | "DRAFT";
export type AssistantLanguage = "sr" | "en";
export type ChatWorkflowName =
  | "triage"
  | "answering"
  | "brief-extraction"
  | "template-retrieval"
  | "drafting"
  | "evaluation"
  | "review";
export type WorkflowJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type WorkflowProgressStage =
  | "UNDERSTANDING_REQUEST"
  | "READING_ATTACHMENTS"
  | "EXTRACTING_FACTS"
  | "PREPARING_ANSWER"
  | "PREPARING_DRAFT"
  | "SAVING_FOR_REVIEW";
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
  | "message.started"
  | "message.delta"
  | "message.updated"
  | "attachment.updated"
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
  feedback?: ChatMessageFeedback | null;
  outcome?: ChatMessageOutcome | null;
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
  activity?: ChatSessionActivitySummary | null;
}

export interface ChatSessionActivitySummary {
  activeJobCount: number;
  latestJob: WorkflowJobResponse | null;
  hasDraft: boolean;
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
  jobs: WorkflowJobResponse[];
  drafts: DraftResultResponse[];
}

export interface ChatSessionCreateRequest {
  workspaceId: string;
  title?: string;
}

export interface ChatSendMessageResponse {
  userMessage: ChatMessageResponse;
  correlationId: string;
}

export interface ChatMessageFeedbackRequest {
  feedback: ChatMessageFeedback | null;
}

export interface WorkflowJobResponse {
  id: string;
  workspaceId: string;
  sessionId: string;
  workflowName: ChatWorkflowName;
  status: WorkflowJobStatus;
  correlationId: string;
  progressStage?: WorkflowProgressStage | null;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatStreamEvent {
  type: ChatEventType;
  workspaceId?: string;
  sessionId: string;
  correlationId?: string;
  createdAt: string;
  message?: ChatMessageResponse;
  messageId?: string;
  delta?: string;
  attachment?: ChatAttachmentSummary;
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
  updatedAt?: string;
  // Script of documentText in this response; stored value is always Latin.
  script?: DocumentScript;
}

export type ClientType = "INDIVIDUAL" | "ORGANIZATION";
export type ClientStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PROSPECT";
export type CaseStatus = "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED" | "ARCHIVED";
export type CasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ActivityType =
  | "NOTE"
  | "PHONE_CALL"
  | "MEETING"
  | "EMAIL"
  | "OTHER";
export type ActivitySource = "MANUAL" | "SYSTEM" | "AI";
export type EventType = "MEETING" | "HEARING" | "CALL" | "OTHER";
export type EventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type DeadlineType =
  | "COURT"
  | "STATUTORY"
  | "CONTRACTUAL"
  | "INTERNAL"
  | "OTHER";
export type DeadlineStatus = "OPEN" | "SATISFIED" | "CANCELLED";
export type NoteType =
  | "GENERAL"
  | "CALL_SUMMARY"
  | "MEETING_SUMMARY"
  | "CASE_UPDATE";

export interface EventSummary {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  isAllDay: boolean;
  status: EventStatus;
  location: string | null;
  meetingUrl: string | null;
  courtName: string | null;
  courtroom: string | null;
  organizerUserId: string;
  caseId: string | null;
  clientIds: string[];
  assigneeUserIds: string[];
  createdAt: string;
  updatedAt: string;
}
export type EventDetail = EventSummary & { attendees: EventAttendee[] };
export interface EventAttendee {
  id: string;
  clientContactId: string | null;
  displayName: string;
  email: string | null;
}
export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: CasePriority;
  assigneeUserId: string;
  dueDate: string | null;
  dueAt: string | null;
  caseId: string | null;
  clientId: string | null;
  deadlineId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
export type TaskDetail = TaskSummary;
export interface DeadlineSummary {
  id: string;
  title: string;
  description: string | null;
  type: DeadlineType;
  dueDate: string | null;
  dueAt: string | null;
  timeZone: string | null;
  status: DeadlineStatus;
  overdue: boolean;
  responsibleUserId: string;
  caseId: string | null;
  clientId: string | null;
  sourceDescription: string | null;
  satisfiedAt: string | null;
  satisfiedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
export type DeadlineDetail = DeadlineSummary;
export interface NoteSummary {
  id: string;
  type: NoteType;
  body: string;
  occurredAt: string;
  caseId: string | null;
  clientId: string | null;
  eventId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
export type NoteDetail = NoteSummary;
export interface ActivityLogSummary {
  id: string;
  action: string;
  actorUserId: string | null;
  occurredAt: string;
  caseId: string | null;
  clientId: string | null;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
}
export type CalendarSourceType = "EVENT" | "TASK" | "DEADLINE";
export interface CalendarItem {
  calendarId: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  date: string | null;
  timeZone: string | null;
  caseId: string | null;
  clientId: string | null;
  responsibleUserId: string | null;
}
export interface CalendarResponse {
  items: CalendarItem[];
  nextCursor: string | null;
}

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
  isDomestic: boolean;
  jmbg: string | null;
  taxNumber: string | null;
  registrationNumber: string | null;
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

export interface CaseNextNumberResponse {
  caseNumber: string;
}
