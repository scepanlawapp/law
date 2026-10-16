import { enumOf } from "./enum-of";
import type {
  CreateWorkEntryRequest,
  WorkEntryTreatment,
} from "./work-entries";
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

export const UserSettingsTheme = {
  MIDNIGHT: "MIDNIGHT",
  DEEP_NAVY: "DEEP_NAVY",
  CHARCOAL: "CHARCOAL",
  DARK_TEAL: "DARK_TEAL",
  BURGUNDY: "BURGUNDY",
  IVORY: "IVORY",
} as const;
export type UserSettingsTheme =
  (typeof UserSettingsTheme)[keyof typeof UserSettingsTheme];
export const UserSettingsAccent = {
  GOLD: "GOLD",
  EMERALD: "EMERALD",
  ROYAL_BLUE: "ROYAL_BLUE",
  COPPER: "COPPER",
  ICE_BLUE: "ICE_BLUE",
  BURGUNDY: "BURGUNDY",
  PURPLE: "PURPLE",
  IVORY: "IVORY",
} as const;
export type UserSettingsAccent =
  (typeof UserSettingsAccent)[keyof typeof UserSettingsAccent];
export const UserSettingsFinish = {
  SOLID: "SOLID",
  METALLIC: "METALLIC",
  BRUSHED: "BRUSHED",
  MATTE: "MATTE",
  LUXURY: "LUXURY",
} as const;
export type UserSettingsFinish =
  (typeof UserSettingsFinish)[keyof typeof UserSettingsFinish];
export const UserSettingsLanguage = {
  SR: "SR",
  EN: "EN",
} as const;
export type UserSettingsLanguage =
  (typeof UserSettingsLanguage)[keyof typeof UserSettingsLanguage];
export const UserSettingsDateTimeFormat = {
  TWELVE_HOUR: "TWELVE_HOUR",
  TWENTY_FOUR_HOUR: "TWENTY_FOUR_HOUR",
} as const;
export type UserSettingsDateTimeFormat =
  (typeof UserSettingsDateTimeFormat)[keyof typeof UserSettingsDateTimeFormat];
export const UserProfileGender = {
  MALE: "MALE",
  FEMALE: "FEMALE",
} as const;
export type UserProfileGender =
  (typeof UserProfileGender)[keyof typeof UserProfileGender];

export const NOTIFICATION_TYPES = [
  "DEADLINE_ASSIGNED",
  "DEADLINE_DUE_SOON",
  "DEADLINE_DUE_TODAY",
  "DEADLINE_OVERDUE",
  "DEADLINE_CHANGED",
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_DUE_TODAY",
  "TASK_OVERDUE",
  "EVENT_UPCOMING",
  "EVENT_CHANGED",
  "EVENT_CANCELLED",
  "TIMER_RUNNING_LONG",
  "TIME_REVIEW_REMINDER",
  "RETAINER_USAGE_80",
  "RETAINER_USAGE_100",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NotificationType = enumOf(NOTIFICATION_TYPES);

export interface NotificationPreferences {
  deadlineAssigned: boolean;
  deadlineDueSoon: boolean;
  deadlineDueToday: boolean;
  deadlineOverdue: boolean;
  deadlineChanged: boolean;
  taskAssigned: boolean;
  taskDueSoon: boolean;
  taskDueToday: boolean;
  taskOverdue: boolean;
  eventUpcoming: boolean;
  eventChanged: boolean;
  eventCancelled: boolean;
  timerRunningLong: boolean;
  timeReviewReminder: boolean;
  retainerUsage: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  deadlineAssigned: true,
  deadlineDueSoon: true,
  deadlineDueToday: true,
  deadlineOverdue: true,
  deadlineChanged: true,
  taskAssigned: true,
  taskDueSoon: true,
  taskDueToday: true,
  taskOverdue: true,
  eventUpcoming: true,
  eventChanged: true,
  eventCancelled: true,
  timerRunningLong: true,
  timeReviewReminder: true,
  retainerUsage: true,
};

export interface UserSettingsProfile {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  gender: UserProfileGender | null;
  avatarUrl: string | null;
}

export interface UserAvatarResponse {
  avatarUrl: string | null;
}

export interface UserSettingsPreferences {
  theme: UserSettingsTheme;
  language: UserSettingsLanguage;
  accentColor: UserSettingsAccent;
  finish: UserSettingsFinish;
  workspaceNotifications: boolean;
  notificationPreferences: NotificationPreferences;
  dateTimeFormat: UserSettingsDateTimeFormat;
  timeZone: string;
  timeReviewReminderEnabled: boolean;
  /** `HH:mm` in the user's time zone. */
  timeReviewReminderTime: string;
  /** Default for how the assistant applies record changes it proposes. */
  assistantPermissionMode: AssistantPermissionMode;
}

/**
 * How the assistant applies a record change: MANUAL prefills the form for the user to save,
 * ASK shows an approval card, AUTO saves directly when nothing is ambiguous.
 */
export const AssistantPermissionMode = {
  MANUAL: "MANUAL",
  ASK: "ASK",
  AUTO: "AUTO",
} as const;
export type AssistantPermissionMode =
  (typeof AssistantPermissionMode)[keyof typeof AssistantPermissionMode];

export const ASSISTANT_PERMISSION_MODES: readonly AssistantPermissionMode[] = [
  "MANUAL",
  "ASK",
  "AUTO",
];

export interface NotificationMetadata {
  caseId?: string;
  caseName?: string;
  clientId?: string;
  clientName?: string;
  dueDate?: string;
  dueAt?: string;
  startsAt?: string;
  oldDueDate?: string | null;
  newDueDate?: string | null;
  oldDueAt?: string | null;
  newDueAt?: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: CalendarSourceType | null;
  entityId: string | null;
  metadata: NotificationMetadata | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  meta: PaginationMeta;
}

export interface NotificationUnreadCountResponse {
  count: number;
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
export const CaseNumberFormat = enumOf(CASE_NUMBER_FORMATS);

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

export const MfaMethod = {
  TOTP: "TOTP",
  RECOVERY: "RECOVERY",
  EMAIL: "EMAIL",
} as const;
export type MfaMethod = (typeof MfaMethod)[keyof typeof MfaMethod];

export const LoginStatus = {
  AUTHENTICATED: "AUTHENTICATED",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_ENROLLMENT_REQUIRED: "MFA_ENROLLMENT_REQUIRED",
} as const;
export type LoginStatus = (typeof LoginStatus)[keyof typeof LoginStatus];

export type LoginResponse =
  | {
      status: typeof LoginStatus.AUTHENTICATED;
      session: AuthSessionResponse;
    }
  | { status: typeof LoginStatus.MFA_REQUIRED; methods: MfaMethod[] }
  | { status: typeof LoginStatus.MFA_ENROLLMENT_REQUIRED };

/** Machine-readable `code` values the API returns in error bodies. */
export const ApiErrorCode = {
  MFA_CODE_INVALID: "MFA_CODE_INVALID",
  MFA_ACCOUNT_THROTTLED: "MFA_ACCOUNT_THROTTLED",
  LAST_TASK_WORK_ENTRY: "LAST_TASK_WORK_ENTRY",
  EVENT_CLIENT_REQUIRED: "EVENT_CLIENT_REQUIRED",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface MfaVerifyRequest {
  method: MfaMethod;
  code: string;
  rememberDevice: boolean;
}

export interface MfaEnrollmentStartRequest {
  /** Required when enrolling from a signed-in session. */
  currentPassword?: string;
}

export interface MfaEnrollmentStartResponse {
  otpauthUrl: string;
  qrCodeDataUrl: string;
  /** Base32 secret for manual entry; shown only while enrolling. */
  secret: string;
}

export interface MfaEnrollmentConfirmRequest {
  code: string;
}

export interface MfaEnrollmentConfirmResponse {
  /** Plaintext recovery codes; returned exactly once. */
  recoveryCodes: string[];
  /** Present when confirming from an enrollment challenge (login step). */
  session?: AuthSessionResponse;
}

export interface MfaPasswordRequest {
  currentPassword: string;
}

export interface MfaRecoveryCodesResponse {
  recoveryCodes: string[];
}

export interface TrustedDeviceSummary {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface MfaStatusResponse {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  policyRequired: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

export interface MfaPolicy {
  mfaRequired: boolean;
}

/** Changing the office-wide 2FA switch requires the admin's password. */
export interface MfaPolicyUpdateRequest extends MfaPolicy {
  currentPassword: string;
}

export interface MemberSecuritySummary {
  userId: string;
  name: string | null;
  email: string;
  role: WorkspaceRole;
  mfaEnabled: boolean;
  mfaEnabledAt: string | null;
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

export const ChatSessionStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type ChatSessionStatus =
  (typeof ChatSessionStatus)[keyof typeof ChatSessionStatus];
export const ChatMessageRole = {
  USER: "USER",
  ASSISTANT: "ASSISTANT",
  SYSTEM: "SYSTEM",
} as const;
export type ChatMessageRole =
  (typeof ChatMessageRole)[keyof typeof ChatMessageRole];
export const ChatMessageStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type ChatMessageStatus =
  (typeof ChatMessageStatus)[keyof typeof ChatMessageStatus];
export const ChatMessageFeedback = {
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
} as const;
export type ChatMessageFeedback =
  (typeof ChatMessageFeedback)[keyof typeof ChatMessageFeedback];
export const ChatMessageOutcome = {
  ANSWER: "ANSWER",
  DRAFT_READY: "DRAFT_READY",
  DRAFT_UNSUPPORTED: "DRAFT_UNSUPPORTED",
  CONTEXT_REQUIRED: "CONTEXT_REQUIRED",
} as const;
export type ChatMessageOutcome =
  (typeof ChatMessageOutcome)[keyof typeof ChatMessageOutcome];
export const TriageDecision = {
  LEGAL: "LEGAL",
  NON_LEGAL: "NON_LEGAL",
  UNCLEAR: "UNCLEAR",
} as const;
export type TriageDecision =
  (typeof TriageDecision)[keyof typeof TriageDecision];
export const AssistantIntent = {
  ANSWER: "ANSWER",
  DRAFT: "DRAFT",
} as const;
export type AssistantIntent =
  (typeof AssistantIntent)[keyof typeof AssistantIntent];
export const AssistantLanguage = {
  SR: "sr",
  EN: "en",
} as const;
export type AssistantLanguage =
  (typeof AssistantLanguage)[keyof typeof AssistantLanguage];
export const ChatWorkflowName = {
  TRIAGE: "triage",
  ANSWERING: "answering",
  AGENT_TURN: "agent-turn",
  AGENT_RESUME: "agent-resume",
  BRIEF_EXTRACTION: "brief-extraction",
  DRAFTING: "drafting",
} as const;
export type ChatWorkflowName =
  (typeof ChatWorkflowName)[keyof typeof ChatWorkflowName];
export const WorkflowJobStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  WAITING_CONFIRMATION: "WAITING_CONFIRMATION",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type WorkflowJobStatus =
  (typeof WorkflowJobStatus)[keyof typeof WorkflowJobStatus];
export const WorkflowProgressStage = {
  UNDERSTANDING_REQUEST: "UNDERSTANDING_REQUEST",
  READING_ATTACHMENTS: "READING_ATTACHMENTS",
  EXTRACTING_FACTS: "EXTRACTING_FACTS",
  PREPARING_ANSWER: "PREPARING_ANSWER",
  PREPARING_DRAFT: "PREPARING_DRAFT",
  SAVING_FOR_REVIEW: "SAVING_FOR_REVIEW",
} as const;
export type WorkflowProgressStage =
  (typeof WorkflowProgressStage)[keyof typeof WorkflowProgressStage];
export const ChatAttachmentExtractionStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  UNSUPPORTED: "UNSUPPORTED",
} as const;
export type ChatAttachmentExtractionStatus =
  (typeof ChatAttachmentExtractionStatus)[keyof typeof ChatAttachmentExtractionStatus];
export const ChatAttachmentSourceScript = {
  LATIN: "LATIN",
  CYRILLIC: "CYRILLIC",
  MIXED: "MIXED",
  NONE: "NONE",
} as const;
export type ChatAttachmentSourceScript =
  (typeof ChatAttachmentSourceScript)[keyof typeof ChatAttachmentSourceScript];
export const DocumentScript = {
  LATIN: "latin",
  CYRILLIC: "cyrillic",
} as const;
export type DocumentScript =
  (typeof DocumentScript)[keyof typeof DocumentScript];
export const DraftApprovalStatus = {
  DRAFT: "DRAFT",
  READY_FOR_SIGNOFF: "READY_FOR_SIGNOFF",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
} as const;
export type DraftApprovalStatus =
  (typeof DraftApprovalStatus)[keyof typeof DraftApprovalStatus];

export const ChatEventType = {
  MESSAGE_CREATED: "message.created",
  MESSAGE_STARTED: "message.started",
  MESSAGE_DELTA: "message.delta",
  MESSAGE_UPDATED: "message.updated",
  ATTACHMENT_UPDATED: "attachment.updated",
  DOCUMENT_CONTENT_UPDATED: "document.content.updated",
  TRIAGE_STARTED: "triage.started",
  TRIAGE_COMPLETED: "triage.completed",
  JOB_QUEUED: "job.queued",
  JOB_UPDATED: "job.updated",
  DRAFT_UPDATED: "draft.updated",
  ANALYSIS_UPDATED: "analysis.updated",
  TOOL_STARTED: "tool.started",
  TOOL_FINISHED: "tool.finished",
  CONFIRMATION_REQUIRED: "confirmation.required",
  CONFIRMATION_UPDATED: "confirmation.updated",
  SESSION_TITLE_UPDATED: "session.title.updated",
  SESSION_DELETED: "session.deleted",
  ERROR: "error",
} as const;
export type ChatEventType = (typeof ChatEventType)[keyof typeof ChatEventType];

export interface ChatAttachmentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  extractionStatus?: ChatAttachmentExtractionStatus;
  sourceScript?: ChatAttachmentSourceScript | null;
  /**
   * Whether the assistant can read this file yet. An unfiled attachment is
   * always readable. One filed as a case document follows that document's AI
   * access: "OFF" when the document has AI access off or is archived.
   */
  aiStatus: DocumentAiStatus;
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
  citations?: LegalCitationResponse[];
  /** Assistant proposals made in this message, shown as confirmation cards. */
  pendingActionIds?: string[];
  /** Candidates the user can pick with one click (latest assistant answer only). */
  choices?: AssistantChoice[];
  createdAt: string;
  attachments: ChatAttachmentSummary[];
}

export interface ChatSessionCaseSummary {
  id: string;
  caseNumber: string;
  name: string;
  clientId: string;
  clientDisplayName: string | null;
}

export interface ChatSessionSummary {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  caseId?: string | null;
  case?: ChatSessionCaseSummary | null;
  title?: string | null;
  status: ChatSessionStatus;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when the conversation is pinned to the top of the sidebar. */
  pinnedAt?: string | null;
  /** Conversation override of the user's assistant permission mode; null uses the setting. */
  permissionMode?: AssistantPermissionMode | null;
  /** Who started the conversation; present on list responses. */
  createdBy?: { id: string; displayName: string } | null;
  activity?: ChatSessionActivitySummary | null;
}

export interface ChatSessionActivitySummary {
  activeJobCount: number;
  latestJob: WorkflowJobResponse | null;
  hasDraft: boolean;
  /** Assistant proposals still waiting for approval. */
  pendingActionCount?: number;
  /** Kinds of document analyses produced in the conversation. */
  analysisKinds?: DocumentAnalysisKind[];
}

export const ChatSessionScope = {
  MINE: "mine",
  TEAM: "team",
} as const;
export type ChatSessionScope =
  (typeof ChatSessionScope)[keyof typeof ChatSessionScope];

/** `pending`: a proposal awaits approval or a job is running. */
export const ChatSessionStateFilter = {
  PENDING: "pending",
  DRAFT: "draft",
  ANALYSIS: "analysis",
} as const;
export type ChatSessionStateFilter =
  (typeof ChatSessionStateFilter)[keyof typeof ChatSessionStateFilter];

export interface ChatSessionListQuery extends PaginationQuery {
  /** `mine` (default on the web) limits to conversations the caller started. */
  scope?: ChatSessionScope;
  /** Every listed state must hold. */
  states?: ChatSessionStateFilter[];
  /** True lists archived conversations instead of active ones. */
  archived?: boolean;
  caseIds?: string[];
  clientIds?: string[];
  authorIds?: string[];
  analysisKinds?: DocumentAnalysisKind[];
  /** `matter` orders by case so matter groups stay contiguous while paging. */
  group?: "date" | "matter";
}

export interface ChatSessionUpdateRequest {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  /** null clears the override and falls back to the user setting. */
  permissionMode?: AssistantPermissionMode | null;
}

export interface ChatSessionFacetsQuery {
  scope?: ChatSessionScope;
  /** Prefix typed in the token search; drives the suggestions. */
  search?: string;
}

export interface ChatSessionFacetCase {
  id: string;
  caseNumber: string;
  name: string;
  clientId: string;
  clientDisplayName: string | null;
}

export interface ChatSessionFacetsResponse {
  /** Active conversations in the scope matching each state, and archived ones. */
  counts: {
    pending: number;
    draft: number;
    analysis: number;
    archived: number;
  };
  suggestions: {
    clients: { id: string; displayName: string }[];
    cases: ChatSessionFacetCase[];
    authors: { id: string; displayName: string }[];
  };
}

export const SortDirection = {
  ASC: "asc",
  DESC: "desc",
} as const;
export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

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
  /** Assistant-agent tool calls of this session, oldest first. */
  toolCalls?: AgentToolCallSummary[];
  /** Assistant proposals awaiting or after a decision, oldest first. */
  pendingActions?: PendingActionSummary[];
  /** Read-only document analyses (contract reviews), oldest first. */
  analyses?: DocumentAnalysisResponse[];
  latestBriefId: string | null;
}

export interface ChatSessionCreateRequest {
  workspaceId: string;
  title?: string;
  caseId?: string | null;
}

export interface ChatSessionLinkCaseRequest {
  caseId: string | null;
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
  briefResultId?: string | null;
  errorCode?: string | null;
  /** Run telemetry (recorded for `agent-turn` runs; timings for all runs). */
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AgentToolCallStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type AgentToolCallStatus =
  (typeof AgentToolCallStatus)[keyof typeof AgentToolCallStatus];

/** One assistant-agent tool call, as shown in the chat activity. */
export interface AgentToolCallSummary {
  id: string;
  jobId: string;
  correlationId: string;
  toolName: string;
  status: AgentToolCallStatus;
  /** Short human-readable argument, e.g. the search query. */
  label: string | null;
  /** Number of results the tool returned, when meaningful. */
  resultCount: number | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export const PendingActionStatus = {
  PENDING: "PENDING",
  EXECUTING: "EXECUTING",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
} as const;
export type PendingActionStatus =
  (typeof PendingActionStatus)[keyof typeof PendingActionStatus];

export const PendingActionType = {
  LINK_CASE: "link_case",
  CREATE_DEADLINE: "create_deadline",
  CREATE_TASKS_FROM_BRIEF: "create_tasks_from_brief",
  UPDATE_CLIENT_FROM_DOCUMENT: "update_client_from_document",
  CREATE_EVENT: "create_event",
  RESCHEDULE_EVENT: "reschedule_event",
  CANCEL_EVENT: "cancel_event",
  CREATE_TASK: "create_task",
  LOG_WORK_ENTRY: "log_work_entry",
} as const;
export type PendingActionType =
  (typeof PendingActionType)[keyof typeof PendingActionType];

/** FORM: prefilled form the user saves; CARD: approval card; AUTO: saved without asking. */
export const PendingActionMode = {
  FORM: "FORM",
  CARD: "CARD",
  AUTO: "AUTO",
} as const;
export type PendingActionMode =
  (typeof PendingActionMode)[keyof typeof PendingActionMode];

/** Event fields the assistant proposed; the shape the event dialog saves. */
export interface AssistantEventRequest {
  type: EventType;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location?: string;
  caseId?: string;
  assigneeUserIds?: string[];
  clientIds?: string[];
  attendees?: Array<{
    clientContactId?: string;
    displayName: string;
    email?: string;
  }>;
}

/** Deadline fields the assistant proposed; the shape the deadline dialog saves. */
export interface AssistantDeadlineRequest {
  title: string;
  description?: string;
  type: DeadlineType;
  dueDate?: string;
  dueAt?: string;
  timeZone: string;
  responsibleUserId: string;
  caseId?: string;
  clientId?: string;
}

/** Values a FORM action opens its dialog with, by the dialog that saves it. */
export type AssistantFormPrefill =
  | {
      kind: "event";
      /** Set when the form edits an existing event (reschedule). */
      eventId?: string;
      request: AssistantEventRequest;
    }
  | { kind: "task"; request: TaskRequest }
  | { kind: "deadline"; request: AssistantDeadlineRequest }
  | { kind: "work_entry"; request: CreateWorkEntryRequest };

/** Kind of record an executed action created or changed. */
export type PendingActionResultEntityType =
  | "EVENT"
  | "TASK"
  | "DEADLINE"
  | "WORK_ENTRY"
  | "CASE"
  /** Several work entries: opens the time review. */
  | "TIME_REVIEW";

/**
 * A candidate the user can pick with one click (ambiguous name, case, event):
 * `label` is shown on the button, `reply` is sent as the user's message.
 */
export interface AssistantChoice {
  label: string;
  reply: string;
}

/** A record change proposed by the assistant, awaiting the user's decision. */
export interface PendingActionSummary {
  id: string;
  jobId: string;
  correlationId: string;
  actionType: PendingActionType;
  /** Human-readable proposal (Serbian, Latin script). */
  summary: string;
  details: string[];
  status: PendingActionStatus;
  mode: PendingActionMode;
  /** FORM mode: the dialog to open and the values to prefill it with. */
  prefill?: AssistantFormPrefill | null;
  /** Id of the record the action created or changed, once executed. */
  resultEntityId?: string | null;
  resultEntityType?: PendingActionResultEntityType | null;
  /** AUTO: the conversation owner may still undo the save (24 h window). */
  canUndo?: boolean;
  /** AUTO: when the save was undone. */
  undoneAt?: string | null;
  /** Human-readable outcome after execution. */
  resultMessage: string | null;
  errorMessage: string | null;
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface PendingActionDecisionRequest {
  reason?: string;
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
  /** `document.content.updated`: attachments of this session on that content. */
  attachmentIds?: string[];
  /** `document.content.updated`: the content's new AI status. */
  status?: DocumentAiStatus;
  job?: WorkflowJobResponse;
  draft?: DraftResultResponse;
  analysis?: DocumentAnalysisResponse;
  toolCall?: AgentToolCallSummary;
  pendingAction?: PendingActionSummary;
  decision?: TriageDecision;
  reason?: string;
  title?: string | null;
  error?: string;
}

// Document types the assistant can draft; the backend registry defines each one.
export const DRAFT_DOCUMENT_TYPES = [
  "LAWSUIT",
  "STATEMENT_OF_DEFENCE",
  "APPEAL",
  "ENFORCEMENT_MOTION",
  "SUBMISSION",
  "SERVICES_CONTRACT",
  "NDA",
  "EMPLOYMENT_CONTRACT",
  "COPYRIGHT_LICENCE",
  "DEMAND_LETTER",
  "TERMINATION_NOTICE",
  "MEDIA_REPLY_REQUEST",
  "POWER_OF_ATTORNEY",
  "CORPORATE_DECISION",
] as const;

export type DraftDocumentType = (typeof DRAFT_DOCUMENT_TYPES)[number];
export const DraftDocumentType = enumOf(DRAFT_DOCUMENT_TYPES);

export const DraftDocumentFamily = {
  LITIGATION: "LITIGATION",
  CONTRACT: "CONTRACT",
  LETTER: "LETTER",
  CORPORATE: "CORPORATE",
} as const;
export type DraftDocumentFamily =
  (typeof DraftDocumentFamily)[keyof typeof DraftDocumentFamily];

export function isDraftDocumentType(
  value: unknown,
): value is DraftDocumentType {
  return (
    typeof value === "string" &&
    (DRAFT_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

// Lawsuit keys with UI translations; other types use their own keys and the
// model's label. "other" carries only a label.
export const BRIEF_MISSING_FIELD_KEYS = [
  "plaintiffName",
  "plaintiffAddress",
  "plaintiffIdNumber",
  "defendantName",
  "defendantAddress",
  "defendantIdNumber",
  "competentCourt",
  "claimValue",
  "legalBasis",
  "factualDescription",
  "reliefSought",
  "serviceDate",
  "contractReference",
  "other",
] as const;

export type BriefMissingFieldKey = (typeof BRIEF_MISSING_FIELD_KEYS)[number];
export const BriefMissingFieldKey = enumOf(BRIEF_MISSING_FIELD_KEYS);

export interface BriefMissingField {
  // A party key (`<role>Name`), a field key of the document type, or "other".
  key: string;
  // Short Serbian Latin phrase, e.g. "Adresa tuženog".
  label: string;
}

export interface BriefEvidenceItem {
  label: string;
  // True when the document is already attached to the conversation.
  provided: boolean;
}

/** The document whose extracted facts filled a brief party. */
export interface BriefFactSource {
  // Document ref (`doc:<id>` or `att:<id>`).
  ref: string;
  title: string;
}

export interface BriefPartyEntry {
  // Role id from the document type, e.g. "plaintiff", "appellant".
  role: string;
  name: string | null;
  address: string | null;
  idNumber: string | null;
  // Set only when the party's values come from a document fact; older briefs have none.
  source?: BriefFactSource | null;
}

export interface BriefFieldValue {
  key: string;
  value: string | null;
}

export interface BriefResult {
  documentType: DraftDocumentType;
  parties: BriefPartyEntry[];
  fields: BriefFieldValue[];
  legalBasis: string[];
  factualDescription: string | null;
  evidence: BriefEvidenceItem[];
  missingFields: BriefMissingField[];
  confidence: number;
  warnings: string[];
}

export interface BriefExtractionResultResponse {
  id: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  messageId: string | null;
  documentType: DraftDocumentType;
  brief: BriefResult;
  confidence: number | null;
  missingFields: BriefMissingField[];
  appliedCaseId?: string | null;
  appliedTaskKeys?: string[];
  promptChars: number;
  truncated: boolean;
  model: string;
  errorCode?: string | null;
  createdAt: string;
}

export interface BriefClientMatch {
  id: string;
  displayName: string;
  clientNumber: string;
}

export interface BriefPartyOption {
  role: string;
  // Serbian role label from the document type, e.g. "Tuženi".
  label: string;
  name: string | null;
  address: string | null;
}

export interface BriefApplyPreviewRequest {
  // Party role to treat as the office's client; defaults to the type's choice.
  clientRole?: string;
}

export interface BriefApplyPreview {
  briefId: string;
  alreadyApplied: boolean;
  appliedCaseId: string | null;
  documentType: DraftDocumentType;
  parties: BriefPartyOption[];
  clientRole: string | null;
  clientPartyName: string | null;
  clientPartyAddress: string | null;
  clientPartySource?: BriefFactSource | null;
  nameNeedsSplit: boolean;
  suggestedFirstName: string | null;
  suggestedLastName: string | null;
  clientMatches: BriefClientMatch[];
  opposingPartyName: string | null;
  opposingPartyAddress: string | null;
  opposingPartySource?: BriefFactSource | null;
  suggestedCaseName: string;
  suggestedDescription: string;
  suggestedCaseNumber: string;
  responsibleUserId: string;
  missingFields: BriefMissingField[];
  warnings: string[];
  confidence: number | null;
}

export interface BriefApplyClientChoice {
  mode: "existing" | "create";
  clientId?: string;
  firstName?: string;
  lastName?: string;
}

export interface BriefApplyRequest {
  client: BriefApplyClientChoice;
  caseNumber: string;
  name: string;
  description?: string;
  responsibleUserId: string;
  opposingPartyName?: string | null;
  opposingPartyAddress?: string | null;
}

export interface BriefApplyResponse {
  briefId: string;
  caseId: string;
  clientId: string;
  createdClient: boolean;
  sessionId: string;
}

export interface BriefTaskProposal {
  key: string;
  source: "missing" | "evidence";
  fieldKey?: string;
  title: string;
  description: string;
  assigneeUserId: string;
  priority: CasePriority;
  // ISO date (YYYY-MM-DD).
  dueDate: string;
  selectedByDefault: boolean;
  alreadyApplied: boolean;
}

export interface BriefTaskPreview {
  briefId: string;
  caseId: string;
  // Drives the evidence wording (dokazi, prilozi, isprave).
  documentFamily: DraftDocumentFamily;
  proposals: BriefTaskProposal[];
}

export interface BriefTaskApplyItem {
  key: string;
  title?: string;
  assigneeUserId?: string;
  dueDate?: string;
}

export interface BriefTaskApplyRequest {
  tasks: BriefTaskApplyItem[];
}

export interface BriefTaskApplyResponse {
  briefId: string;
  caseId: string;
  createdTaskIds: string[];
  skippedKeys: string[];
}

export interface LegalCitationResponse {
  marker: number;
  articleNumber: string | null;
  sourceTitle: string;
  sourceUrl: string;
  snippet: string;
  score: number;
}

// Contract types with a built-in review checklist; OTHER_CONTRACT is generic.
export const CONTRACT_REVIEW_TYPES = [
  "SERVICES_CONTRACT",
  "NDA",
  "EMPLOYMENT_CONTRACT",
  "COPYRIGHT_LICENCE",
  "OTHER_CONTRACT",
] as const;

export type ContractReviewType = (typeof CONTRACT_REVIEW_TYPES)[number];
export const ContractReviewType = enumOf(CONTRACT_REVIEW_TYPES);

export const ContractIssueRisk = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;
export type ContractIssueRisk =
  (typeof ContractIssueRisk)[keyof typeof ContractIssueRisk];

// RISK: unfavourable for the client; COMPLIANCE: conflicts with mandatory law.
export const ContractIssueCategory = {
  RISK: "RISK",
  COMPLIANCE: "COMPLIANCE",
} as const;
export type ContractIssueCategory =
  (typeof ContractIssueCategory)[keyof typeof ContractIssueCategory];

export interface ContractKeyTerm {
  label: string;
  value: string;
  // Clause reference as written in the contract, e.g. "Član 5".
  clause: string | null;
}

export interface ContractReviewIssue {
  title: string;
  category: ContractIssueCategory;
  risk: ContractIssueRisk;
  clause: string | null;
  // Short verbatim quote of the clause.
  quote: string | null;
  explanation: string;
  // Suggested replacement or added wording.
  suggestion: string | null;
  // Legal-source markers ([n]) that support the issue.
  citations: number[];
}

export interface ContractMissingClause {
  title: string;
  explanation: string;
  suggestion: string | null;
}

export interface ContractReviewResult {
  summary: string;
  keyTerms: ContractKeyTerm[];
  issues: ContractReviewIssue[];
  missingClauses: ContractMissingClause[];
  warnings: string[];
}

export const DocumentAnalysisKind = {
  CONTRACT_REVIEW: "CONTRACT_REVIEW",
  CASE_TIMELINE: "CASE_TIMELINE",
} as const;
export type DocumentAnalysisKind =
  (typeof DocumentAnalysisKind)[keyof typeof DocumentAnalysisKind];

interface DocumentAnalysisBase {
  id: string;
  sessionId: string;
  caseId: string | null;
  // doc:<id> / att:<id> for a review; case:<id> or session:<id> for a timeline.
  documentRef: string;
  documentTitle: string;
  citations: LegalCitationResponse[];
  truncated: boolean;
  model: string;
  createdAt: string;
}

export interface ContractReviewAnalysis extends DocumentAnalysisBase {
  kind: "CONTRACT_REVIEW";
  contractType: ContractReviewType;
  // The party the office represents, as the lawyer named it.
  clientSide: string | null;
  result: ContractReviewResult;
}

export const CASE_TIMELINE_EVENT_KINDS = [
  "FILING",
  "DECISION",
  "HEARING",
  "CORRESPONDENCE",
  "CONTRACT",
  "PAYMENT",
  "DEADLINE",
  "OTHER",
] as const;

export type CaseTimelineEventKind = (typeof CASE_TIMELINE_EVENT_KINDS)[number];
export const CaseTimelineEventKind = enumOf(CASE_TIMELINE_EVENT_KINDS);

export interface CaseTimelineEvent {
  // YYYY-MM-DD, YYYY-MM or YYYY; null when the document gives no usable date.
  date: string | null;
  // The date as written in the document.
  dateText: string | null;
  kind: CaseTimelineEventKind;
  title: string;
  description: string;
  // Verified verbatim excerpt of the source, or null.
  quote: string | null;
  sourceRef: string;
  sourceTitle: string;
}

// READ: fully read; TRUNCATED: read up to the limit; NO_TEXT: no readable
// text; FAILED: extraction call failed; SKIPPED: beyond the document limit.
export const CaseTimelineSourceStatus = {
  READ: "READ",
  TRUNCATED: "TRUNCATED",
  NO_TEXT: "NO_TEXT",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type CaseTimelineSourceStatus =
  (typeof CaseTimelineSourceStatus)[keyof typeof CaseTimelineSourceStatus];

export interface CaseTimelineSource {
  ref: string;
  title: string;
  status: CaseTimelineSourceStatus;
  // One-sentence summary of the document, when read.
  summary: string | null;
  eventCount: number;
}

export interface CaseTimelineResult {
  summary: string;
  events: CaseTimelineEvent[];
  openQuestions: string[];
  sources: CaseTimelineSource[];
  warnings: string[];
}

export interface CaseTimelineAnalysis extends DocumentAnalysisBase {
  kind: "CASE_TIMELINE";
  result: CaseTimelineResult;
}

export type DocumentAnalysisResponse =
  | ContractReviewAnalysis
  | CaseTimelineAnalysis;

export interface DraftResultResponse {
  id: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  caseId?: string | null;
  messageId: string | null;
  briefResultId: string | null;
  documentType: DraftDocumentType;
  documentText: string;
  finalDocumentText?: string | null;
  warnings: string[];
  missingFields?: BriefMissingField[];
  citations: LegalCitationResponse[];
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

export const ClientType = {
  INDIVIDUAL: "INDIVIDUAL",
  ORGANIZATION: "ORGANIZATION",
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];
export const ClientStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
  PROSPECT: "PROSPECT",
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];
export const CaseStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  CLOSED: "CLOSED",
  ARCHIVED: "ARCHIVED",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];
export const CasePriority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type CasePriority = (typeof CasePriority)[keyof typeof CasePriority];
export const ActivityType = {
  NOTE: "NOTE",
  PHONE_CALL: "PHONE_CALL",
  MEETING: "MEETING",
  EMAIL: "EMAIL",
  OTHER: "OTHER",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];
export const ActivitySource = {
  MANUAL: "MANUAL",
  SYSTEM: "SYSTEM",
  AI: "AI",
} as const;
export type ActivitySource =
  (typeof ActivitySource)[keyof typeof ActivitySource];
export const EventType = {
  MEETING: "MEETING",
  HEARING: "HEARING",
  CALL: "CALL",
  OTHER: "OTHER",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
export const EventStatus = {
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];
export const TaskStatus = {
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export const DeadlineType = {
  COURT: "COURT",
  STATUTORY: "STATUTORY",
  CONTRACTUAL: "CONTRACTUAL",
  INTERNAL: "INTERNAL",
  OTHER: "OTHER",
} as const;
export type DeadlineType = (typeof DeadlineType)[keyof typeof DeadlineType];
export const DeadlineStatus = {
  OPEN: "OPEN",
  SATISFIED: "SATISFIED",
  CANCELLED: "CANCELLED",
} as const;
export type DeadlineStatus =
  (typeof DeadlineStatus)[keyof typeof DeadlineStatus];
export interface UserReference {
  id: string;
  displayName: string;
  email: string | null;
}

export interface ClientReference {
  id: string;
  clientNumber: string;
  type: ClientType;
  displayName: string;
  status: ClientStatus;
}

export interface CaseReference {
  id: string;
  caseNumber: string;
  name: string;
  status: CaseStatus;
  priority: CasePriority;
}

export interface EventSummary {
  hasWorkEntry: boolean;
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
  organizerUser: UserReference;
  case: CaseReference | null;
  clients: ClientReference[];
  assigneeUsers: UserReference[];
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
  assigneeUser: UserReference;
  dueDate: string | null;
  dueAt: string | null;
  case: CaseReference | null;
  client: ClientReference | null;
  deadlineId: string | null;
  completedAt: string | null;
  completedByUser: UserReference | null;
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
  responsibleUser: UserReference;
  case: CaseReference | null;
  client: ClientReference | null;
  sourceDescription: string | null;
  satisfiedAt: string | null;
  satisfiedByUser: UserReference | null;
  createdAt: string;
  updatedAt: string;
}
export type DeadlineDetail = DeadlineSummary;
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
export const CalendarSourceType = {
  EVENT: "EVENT",
  TASK: "TASK",
  DEADLINE: "DEADLINE",
} as const;
export type CalendarSourceType =
  (typeof CalendarSourceType)[keyof typeof CalendarSourceType];
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
  case: CaseReference | null;
  client: ClientReference | null;
  responsibleUser: UserReference | null;
  assigneeUsers: UserReference[];
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
  responsibleUser: UserReference | null;
  activeCaseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDetail extends ClientSummary {
  referringLawyer: UserReference | null;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  isDomestic: boolean;
  isPublicSector: boolean;
  jbkjs: string | null;
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
  client: ClientReference;
  name: string;
  status: CaseStatus;
  priority: CasePriority;
  responsibleUser: UserReference;
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
  opposingPartyName: string | null;
  opposingPartyAddress: string | null;
  confidentialityLevel: string | null;
  customFields: Record<string, unknown> | null;
  tags: ReferenceSummary[];
}

export type CaseListResponse = PaginatedResponse<CaseSummary>;

export interface CaseNextNumberResponse {
  caseNumber: string;
}

export const DOCUMENT_CATEGORIES = [
  "CONTRACT_AGREEMENT",
  "POWER_OF_ATTORNEY",
  "PLEADING_SUBMISSION",
  "COURT_AUTHORITY_DECISION",
  "SUMMONS_OFFICIAL_NOTICE",
  "MINUTES_OFFICIAL_RECORD",
  "EVIDENCE",
  "EXPERT_REPORT",
  "CORRESPONDENCE",
  "IDENTITY_REGISTRATION",
  "CERTIFICATE_EXTRACT",
  "FINANCIAL_DOCUMENT",
  "LEGAL_OPINION_ANALYSIS",
  "OTHER",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DocumentCategory = enumOf(DOCUMENT_CATEGORIES);

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export interface DocumentVersionSummary {
  id: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

export interface DocumentFolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  archivedAt?: string | null;
  createdAt: string;
}
export interface DocumentFolderUpdateRequest {
  name?: string;
  parentId?: string | null;
}
export interface DocumentFolderBrowseResponse {
  folders: DocumentFolderSummary[];
  breadcrumbs: DocumentFolderSummary[];
}
export interface EnsureDocumentFoldersRequest {
  targetParentFolderId?: string | null;
  paths: string[];
}
export interface EnsureDocumentFoldersResponse {
  folders: Array<{ path: string; id: string }>;
}
export interface DocumentStatistics {
  active: number;
  addedThisMonth: number;
  needsLinking: number;
  archived: number;
}

export const DocumentAiStatus = {
  OFF: "OFF",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  UNSUPPORTED: "UNSUPPORTED",
} as const;
export type DocumentAiStatus =
  (typeof DocumentAiStatus)[keyof typeof DocumentAiStatus];

export const DocumentKind = {
  ID_CARD: "ID_CARD",
  PASSPORT: "PASSPORT",
  APR_EXCERPT: "APR_EXCERPT",
  COURT_DECISION: "COURT_DECISION",
  ADMIN_DECISION: "ADMIN_DECISION",
  OTHER: "OTHER",
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

export interface BulkDocumentAiAccessRequest {
  documentIds: string[];
  aiAccess: boolean;
}

export interface BulkDocumentAiAccessResponse {
  updated: number;
}

export interface DocumentSummary {
  folderId?: string | null;
  id: string;
  title: string;
  category: string | null;
  archived: boolean;
  archivedAt: string | null;
  aiAccess: boolean;
  aiStatus: DocumentAiStatus;
  /**
   * The assistant's processing of this document can be retried by hand: it
   * failed, stalled in the queue, or finished without a kind or facts.
   */
  aiRetryable: boolean;
  documentKind: DocumentKind | null;
  fromAssistantChat: boolean;
  cases: CaseReference[];
  clients: ClientReference[];
  currentVersion: DocumentVersionSummary | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentDetail = DocumentSummary;
export type DocumentListResponse = PaginatedResponse<DocumentSummary>;
export type DocumentVersionListResponse =
  PaginatedResponse<DocumentVersionSummary>;

export interface DocumentListQuery extends PaginationQuery {
  createdByUserId?: string;
  /** Omitted means all locations; "root" means direct root files. */
  folderId?: string;
  view?: DocumentListView;
  caseId?: string;
  caseIds?: string[];
  clientId?: string;
  archived?: DocumentArchivedFilter;
  category?: DocumentCategory;
  uncategorized?: boolean;
}

export interface DocumentUpdateRequest {
  folderId?: string | null;
  title?: string;
  category?: DocumentCategory | null;
  caseIds?: string[];
  clientIds?: string[];
}

export const InvoiceLineStatus = {
  UNBILLED: "UNBILLED",
  RESERVED: "RESERVED",
  BILLED: "BILLED",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceLineStatus =
  (typeof InvoiceLineStatus)[keyof typeof InvoiceLineStatus];
export const InvoiceStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  VOIDED: "VOIDED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export const PriceSourceScope = {
  CLIENT_AGREEMENT: "CLIENT_AGREEMENT",
  WORKSPACE_PUBLIC_REFERENCE: "WORKSPACE_PUBLIC_REFERENCE",
  COMPANY_CATALOG: "COMPANY_CATALOG",
  CASE_OVERRIDE: "CASE_OVERRIDE",
} as const;
export type PriceSourceScope =
  (typeof PriceSourceScope)[keyof typeof PriceSourceScope];

export interface PriceSourceVersion {
  id: string;
  workspaceId: string;
  priceSourceId: string;
  version: number;
  rawText: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface PriceSourceSummary {
  id: string;
  workspaceId: string;
  scope: PriceSourceScope;
  clientId: string | null;
  caseId: string | null;
  title: string;
  sourceUrl: string | null;
  documentId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  versions: PriceSourceVersion[];
}

export interface Invoice {
  id: string;
  workspaceId: string;
  clientId: string;
  invoiceNumber: string;
  dateOfCreate: string;
  dateOfMaturity: string;
  dateOfTurnover: string;
  placeOfIssue: string;
  methodOfPayment: string;
  comment: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  grossAmount: string;
  numberOfCashBill: string;
  country: string;
  currency: string;
  vatLiabilityTimingCode: "3" | "35" | "432" | null;
  status: InvoiceStatus;
  sharedAt: string | null;
  sharedMethod: string | null;
  externalInvoiceNumber: string | null;
  externalInvoiceDate: string | null;
  externalReference: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  printWorkSpecification: boolean;
  billingMonth: string | null;
  createdAt: string;
  updatedAt: string;
  client: FinancialClientReference;
  lines: InvoiceLineSummary[];
  total: string;
}

export type FinancialClientReference = ClientReference;

export type FinancialCaseReference = CaseReference;

export interface InvoiceWorkEntryAllocation {
  workEntryId: string;
  originalValue: string | null;
  originalCurrency: string | null;
  invoiceValue: string;
  currency: string;
}

export interface InvoiceLineSummary {
  additionalAmount?: string;
  workEntryAllocations?: InvoiceWorkEntryAllocation[];
  id: string;
  invoiceId: string;
  client: FinancialClientReference;
  cases: FinancialCaseReference[];
  performedBy: UserReference;
  lineOrder: number | null;
  description: string;
  serviceDate: string;
  netAmount: string;
  vatRate: string;
  taxCategoryCode: string | null;
  taxExemptionReasonCode: string | null;
  taxExemptionReasonText: string | null;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  sourceType: string | null;
  status: InvoiceLineStatus;
  sourceId: string | null;
  pricingRequired: boolean;
  minutes: number | null;
  workEntries: InvoiceWorkEntrySummary[];
  billedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface InvoiceWorkEntrySummary {
  id: string;
  workDate: string;
  user: UserReference;
  title: string;
  description: string;
  minutes: number | null;
  case?: CaseReference | null;
  treatment?: WorkEntryTreatment;
  value?: string | null;
  currency?: string | null;
}

export interface InvoiceSummary {
  collection?: import("./payments").InvoiceCollection;
  id: string;
  invoiceNumber: string;
  client: FinancialClientReference;
  dateOfCreate: string;
  dateOfMaturity: string;
  currency: string;
  status: InvoiceStatus;
  total: string;
  lines: InvoiceLineSummary[];
}

export const SefEnvironment = {
  DEMO: "DEMO",
  PRODUCTION: "PRODUCTION",
} as const;
export type SefEnvironment =
  (typeof SefEnvironment)[keyof typeof SefEnvironment];
export const SefSubmissionState = {
  PREPARED: "PREPARED",
  SENDING: "SENDING",
  SUBMITTED: "SUBMITTED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
} as const;
export type SefSubmissionState =
  (typeof SefSubmissionState)[keyof typeof SefSubmissionState];
export const SefValidationSeverity = {
  ERROR: "ERROR",
  WARNING: "WARNING",
} as const;
export type SefValidationSeverity =
  (typeof SefValidationSeverity)[keyof typeof SefValidationSeverity];

export interface SefValidationIssue {
  code: string;
  severity: SefValidationSeverity;
  fieldPath: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

export interface SefValidationResult {
  valid: boolean;
  issues: SefValidationIssue[];
  validationVersion: string;
}

export interface InvoiceSefSubmission {
  id: string;
  environment: SefEnvironment;
  revision: number;
  state: SefSubmissionState;
  sefInvoiceId: string | null;
  sefSalesInvoiceId: string | null;
  sefPurchaseInvoiceId: string | null;
  remoteStatus: string | null;
  payloadSha256: string;
  validationResult: SefValidationResult;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  httpStatus: number | null;
  attemptCount: number;
  submittedAt: string | null;
  sendingStartedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceSefStateResponse {
  configured: boolean;
  enabled: boolean;
  environment: SefEnvironment;
  immutable: boolean;
  submission: InvoiceSefSubmission | null;
}

export interface InvoiceSefRequest {
  bankAccountId?: string;
}
export const InvoiceNumberResetPolicy = {
  NEVER: "NEVER",
  YEARLY: "YEARLY",
  MONTHLY: "MONTHLY",
} as const;
export type InvoiceNumberResetPolicy =
  (typeof InvoiceNumberResetPolicy)[keyof typeof InvoiceNumberResetPolicy];
export const PaymentMethodPreference = {
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH",
  CARD: "CARD",
  OTHER: "OTHER",
} as const;
export type PaymentMethodPreference =
  (typeof PaymentMethodPreference)[keyof typeof PaymentMethodPreference];
export const ExchangeRateSource = {
  NBS_MIDDLE: "NBS_MIDDLE",
  NBS_BUY: "NBS_BUY",
  NBS_SELL: "NBS_SELL",
  MANUAL: "MANUAL",
} as const;
export type ExchangeRateSource =
  (typeof ExchangeRateSource)[keyof typeof ExchangeRateSource];
export const PaymentQrStandard = {
  NBS_IPS: "NBS_IPS",
} as const;
export type PaymentQrStandard =
  (typeof PaymentQrStandard)[keyof typeof PaymentQrStandard];

export interface CompanySettings {
  legalName: string | null;
  displayName: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  jbkjs: string | null;
}

export interface TaxSettings {
  vatRegistered: boolean;
  defaultVatRate: number | null;
  availableVatRates: number[];
  defaultTaxCategoryCode: string | null;
  defaultTaxExemptionReasonCode: string | null;
  defaultTaxExemptionReasonText: string | null;
  cashAccountingEnabled: boolean;
}

export interface SefSettings {
  enabled: boolean;
  environment: SefEnvironment;
  hasApiKey: boolean;
  maskedApiKey: string | null;
}

export interface InvoiceNumberingSettings {
  pattern: string;
  startingSequence: number;
  incrementBy: number;
  resetPolicy: InvoiceNumberResetPolicy;
  allowManualOverride: boolean;
}

export interface PaymentSettings {
  defaultPaymentTermDays: number;
  defaultPaymentMethod: PaymentMethodPreference;
  defaultPaymentModel: string | null;
  paymentReferencePattern: string | null;
}

export interface CurrencySettings {
  defaultCurrencyCode: string;
  allowedCurrencyCodes: string[];
  exchangeRateSource: ExchangeRateSource;
  allowManualExchangeRate: boolean;
  exchangeRatePrecision: number;
  amountPrecision: number;
}

export interface InvoiceDefaultsSettings {
  defaultIssuePlace: string | null;
  defaultLanguage: string;
  defaultUnitOfMeasure: string | null;
  defaultNote: string | null;
  defaultFooterText: string | null;
}

export interface InvoicePaymentQrSettings {
  enabled: boolean;
  paymentStandard: PaymentQrStandard;
  paymentAccountId: string | null;
  paymentPurposeTemplate: string;
  referenceModel: "00" | "97" | null;
  referenceTemplate: string | null;
}

export interface SefAttachmentSettings {
  includeGeneratedInvoicePdf: boolean;
  includeUserAttachments: boolean;
  allowedFileExtensions: string[];
  maxAttachmentCount: number | null;
  maxSingleFileSizeMb: number | null;
}

export interface BankAccount {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftBic: string | null;
  currencyCode: string;
  isDefault: boolean;
  active: boolean;
}

export type BankAccountRequest = Omit<BankAccount, "id">;

export interface OtherOrganizationSettings {
  caseNumberPattern: string;
}

export interface OrganizationSettings {
  other: OtherOrganizationSettings;
  company: CompanySettings;
  tax: TaxSettings;
  sef: SefSettings;
  invoiceNumbering: InvoiceNumberingSettings;
  payment: PaymentSettings;
  currency: CurrencySettings;
  invoiceDefaults: InvoiceDefaultsSettings;
  paymentQr: InvoicePaymentQrSettings;
  sefAttachments: SefAttachmentSettings;
  bankAccounts: BankAccount[];
}

export interface InvoiceNumberSuggestion {
  invoiceNumber: string;
}

export interface CreateInvoiceRequest {
  invoiceNumber?: string;
  clientId: string;
  dateOfCreate: string;
  dateOfMaturity: string;
  dateOfTurnover: string;
  placeOfIssue: string;
  methodOfPayment: string;
  comment: string;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
  numberOfCashBill: string;
  country: string;
  currency: string;
  vatLiabilityTimingCode?: "3" | "35" | "432" | null;
  lines: InvoiceLineInput[];
  idempotencyKey?: string;
  printWorkSpecification?: boolean;
}

export interface UpdateInvoiceRequest {
  invoiceNumber?: string;
  dateOfCreate?: string;
  dateOfMaturity?: string;
  dateOfTurnover?: string;
  placeOfIssue?: string;
  methodOfPayment?: string;
  comment?: string;
  netAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  grossAmount?: number;
  numberOfCashBill?: string;
  country?: string;
  vatLiabilityTimingCode?: "3" | "35" | "432" | null;
  lines?: InvoiceLineInput[];
  printWorkSpecification?: boolean;
}

export interface InvoiceLineInput {
  additionalAmount?: number;
  workEntryAllocations?: { workEntryId: string; invoiceValue: number }[];
  /** Existing line id when editing; omit for new lines. */
  id?: string;
  serviceDate: string;
  description: string;
  netAmount: number;
  vatRate: number;
  taxCategoryCode?: string | null;
  taxExemptionReasonCode?: string | null;
  taxExemptionReasonText?: string | null;
  vatAmount: number;
  grossAmount: number;
  currency: string;
  workEntryIds?: string[];
  pricingRequired?: boolean;
  minutes?: number;
}

export type PriceEvidence = {
  priceSourceId: string;
  priceSourceVersionId: string;
  passageId: string;
  exactExcerpt: string;
  title: string;
  effectiveDate?: string;
  applicabilityNote?: string;
  calculation?: string;
};

export type InvoiceProposalRequest = {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  caseIds?: string[];
  eligibleLineIds?: string[];
  draftInvoiceId?: string;
  userInstruction: string;
  currentLines?: Array<{
    lineId: string;
    description: string;
    amount: string;
  }>;
  proposalId?: string;
  revisionInstruction?: string;
};

export type InvoiceProposalResponse = {
  proposalId: string;
  revision: number;
  inputFingerprint: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  decisions: Array<{
    lineId: string;
    action: "INCLUDE" | "EXCLUDE" | "NEEDS_REVIEW";
    reason: string;
    clientDescription: string | null;
    existingLineAmount: string;
    proposedChargeAmount: string | null;
    amountBasis: "EXISTING_LINE" | "PRICE_SOURCE" | "USER_STATED" | "NONE";
    adjustmentReason: string | null;
    priceEvidence: PriceEvidence[];
  }>;
  missingWorkReminders: Array<{ candidateKey: string; reason: string }>;
  questions: string[];
  warnings: string[];
};

export interface TaskRequest {
  /** Complete using already linked work, without inserting another entry. */
  finishWithoutNewWork?: boolean;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: CasePriority;
  assigneeUserId: string;
  dueDate?: string;
  dueAt?: string;
  caseId?: string;
  clientId?: string;
  deadlineId?: string;
  /** Confirmed capture saved atomically when status becomes DONE. */
  workEntry?: CreateWorkEntryRequest;
}

/** Primary contact edited together with a client. Empty channels clear stored values. */
export interface ClientPrimaryContactInput {
  id?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export * from "./revenue-sharing";

export interface ClientRequest {
  primaryContact?: ClientPrimaryContactInput;
  type: ClientType;
  status?: ClientStatus;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  organizationName?: string;
  isDomestic?: boolean;
  isPublicSector?: boolean;
  jbkjs?: string;
  jmbg?: string;
  taxNumber?: string;
  registrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  preferredLanguage?: string;
  notes?: string;
  responsibleUserId?: string;
  referringLawyerId?: string | null;
  tagIds?: string[];
}

export * from "./payments";

export interface ActivityLogListQuery {
  page?: number;
  pageSize?: number;
  actorUserId?: string;
  caseId?: string;
  clientId?: string;
}

export interface CaseListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  clientId?: string;
  clientIds?: string[];
  assignedUserId?: string;
  responsibleUserId?: string;
  caseTypeId?: string;
  practiceAreaId?: string;
  tags?: string[];
}

export const DocumentListView = {
  RECENT: "recent",
  NEEDS_LINKING: "needs-linking",
} as const;
export type DocumentListView =
  (typeof DocumentListView)[keyof typeof DocumentListView];

export const DocumentArchivedFilter = {
  ARCHIVED: "true",
  ACTIVE: "false",
  ALL: "all",
} as const;
export type DocumentArchivedFilter =
  (typeof DocumentArchivedFilter)[keyof typeof DocumentArchivedFilter];

export const ClientAddressType = {
  HEADQUARTERS: "HEADQUARTERS",
  HOME: "HOME",
  REGISTERED: "REGISTERED",
  DELIVERY: "DELIVERY",
  BILLING: "BILLING",
  OFFICE: "OFFICE",
  POSTAL: "POSTAL",
} as const;
export type ClientAddressType =
  (typeof ClientAddressType)[keyof typeof ClientAddressType];

export const ClientContactStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
export type ClientContactStatus =
  (typeof ClientContactStatus)[keyof typeof ClientContactStatus];
