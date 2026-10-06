import { inject, Injectable } from "@angular/core";
import {
  HttpClient,
  HttpContext,
  HttpEvent,
  HttpParams,
} from "@angular/common/http";
import { Observable } from "rxjs";
import {
  AuthSessionResponse,
  ChatSendMessageResponse,
  ChatMessageFeedback,
  ChatMessageResponse,
  BriefApplyPreview,
  BriefApplyRequest,
  BriefApplyResponse,
  BriefTaskApplyRequest,
  BriefTaskApplyResponse,
  BriefTaskPreview,
  ChatSessionCreateRequest,
  ChatSessionDetail,
  ChatSessionListResponse,
  ChatSessionSummary,
  DocumentScript,
  DraftResultResponse,
  CaseDetail,
  CaseListResponse,
  CaseNextNumberResponse,
  CaseNumberFormat,
  CasePriority,
  CaseStatus,
  ClientDetail,
  ClientListResponse,
  ClientStatus,
  ClientType,
  PaginationQuery,
  InvitationAcceptRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
  UserSettingsResponse,
  UserSettingsUpdateRequest,
  PendingActionSummary,
  WorkflowJobResponse,
  CalendarResponse,
  EventDetail,
  ActivityLogSummary,
  DeadlineDetail,
  DeadlineStatus,
  DeadlineType,
  PaginatedResponse,
  TaskDetail,
  TaskStatus,
  DocumentDetail,
  DocumentFolderBrowseResponse,
  EnsureDocumentFoldersRequest,
  EnsureDocumentFoldersResponse,
  DocumentStatistics,
  DocumentListQuery,
  DocumentListResponse,
  DocumentUpdateRequest,
  DocumentVersionListResponse,
  Invoice,
  InvoiceSummary,
  CreateInvoiceRequest,
  PriceSourceSummary,
  PriceSourceVersion,
  PriceSourceScope,
  UpdateInvoiceRequest,
  NotificationDto,
  NotificationListResponse,
  NotificationUnreadCountResponse,
  ClientBillingProfile,
  ConfirmSourceEntryRequest,
  ConfirmWorkEntryRequest,
  CreateServiceCategoryRequest,
  CreateUserRateRequest,
  CreateWorkEntryRequest,
  MonthEndPrecheck,
  MonthEndRunResult,
  ProfitabilityReport,
  RetainerAgreement,
  RetainerUsage,
  ServiceCategory,
  StartTimerRequest,
  TimeReviewResponse,
  UpdateServiceCategoryRequest,
  UpdateWorkEntryRequest,
  UpsertRetainerAgreementRequest,
  UserRate,
  WorkCaptureParseRequest,
  WorkCaptureParseResponse,
  WorkEntry,
  WorkEntryQuery,
  WorkspaceBillingConfig,
  OrganizationSettings,
  CompanySettings,
  TaxSettings,
  SefSettings,
  InvoiceNumberingSettings,
  PaymentSettings,
  CurrencySettings,
  InvoiceDefaultsSettings,
  InvoicePaymentQrSettings,
  SefAttachmentSettings,
  BankAccount,
  BankAccountRequest,
  InvoiceNumberSuggestion,
  InvoiceSefRequest,
  InvoiceSefStateResponse,
  InvoiceSefSubmission,
  SefValidationResult,
  WriteOffWorkEntryRequest,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";
import { chatEventsUrl, workspaceChatEventsUrl } from "./chat-events-url";

export interface ReferenceRequest {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

export interface CalendarQuery {
  from: string;
  to: string;
  limit?: number;
  userId?: string;
  userIds?: string[];
  clientId?: string;
  caseId?: string;
  sourceType?: "EVENT" | "TASK" | "DEADLINE";
  sourceTypes?: Array<"EVENT" | "TASK" | "DEADLINE">;
  status?: string;
  statuses?: string[];
  includeNoDueDate?: boolean;
}

export interface EventRequest {
  type: "MEETING" | "HEARING" | "CALL" | "OTHER";
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  courtName?: string;
  courtroom?: string;
  caseId?: string;
  assigneeUserIds?: string[];
  clientIds?: string[];
  attendees?: Array<{
    clientContactId?: string;
    displayName: string;
    email?: string;
  }>;
}

export interface EventListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  type?: EventDetail["type"];
  status?: EventDetail["status"];
  statuses?: EventDetail["status"][];
  caseId?: string;
  clientId?: string;
  userId?: string;
  userIds?: string[];
}

export interface TaskListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  status?: TaskStatus;
  statuses?: TaskStatus[];
  priority?: CasePriority;
  assigneeUserId?: string;
  assigneeUserIds?: string[];
  caseId?: string;
  clientId?: string;
  deadlineId?: string;
}

export interface TaskRequest {
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
}

export interface DeadlineListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  status?: DeadlineStatus;
  statuses?: DeadlineStatus[];
  type?: DeadlineType;
  responsibleUserId?: string;
  responsibleUserIds?: string[];
  caseId?: string;
  clientId?: string;
}

export interface DeadlineRequest {
  title: string;
  description?: string;
  type: DeadlineType;
  dueDate?: string;
  dueAt?: string;
  timeZone: string;
  responsibleUserId: string;
  caseId?: string;
  clientId?: string;
  sourceDescription?: string;
}

export interface ActivityLogListQuery {
  page?: number;
  pageSize?: number;
  caseId?: string;
  clientId?: string;
}

@Injectable({ providedIn: "root" })
export class AuthApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  login(request: LoginRequest): Observable<AuthSessionResponse> {
    return this.http.post<AuthSessionResponse>(
      this.endpoint("/auth/login"),
      request,
      { withCredentials: true },
    );
  }

  me(): Observable<AuthSessionResponse> {
    return this.http.get<AuthSessionResponse>(this.endpoint("/auth/me"), {
      withCredentials: true,
    });
  }

  refresh(): Observable<AuthSessionResponse> {
    return this.http.post<AuthSessionResponse>(
      this.endpoint("/auth/refresh"),
      {},
      { withCredentials: true },
    );
  }

  logout(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      this.endpoint("/auth/logout"),
      {},
      { withCredentials: true },
    );
  }

  acceptInvitation(
    request: InvitationAcceptRequest,
  ): Observable<AuthSessionResponse> {
    return this.http.post<AuthSessionResponse>(
      this.endpoint("/auth/invitations/accept"),
      request,
      { withCredentials: true },
    );
  }

  forgotPassword(
    request: PasswordForgotRequest,
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      this.endpoint("/auth/password/forgot"),
      request,
    );
  }

  resetPassword(
    request: PasswordResetRequest,
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      this.endpoint("/auth/password/reset"),
      request,
    );
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      this.endpoint("/auth/password/change"),
      { currentPassword, newPassword },
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class ChatApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  private workspaceOptions(workspaceId: string) {
    return {
      withCredentials: true,
      headers: { "X-Workspace-Id": workspaceId },
    };
  }

  listSessions(
    workspaceId: string,
    query: PaginationQuery = {},
  ): Observable<ChatSessionListResponse> {
    let params = new HttpParams();
    if (query.page) params = params.set("page", query.page);
    if (query.pageSize) params = params.set("pageSize", query.pageSize);
    if (query.sort?.length) {
      params = params.set(
        "sort",
        query.sort.map((item) => `${item.field}:${item.direction}`).join(","),
      );
    }
    if (query.search) params = params.set("search", query.search);
    if (query.from) params = params.set("from", query.from);
    if (query.to) params = params.set("to", query.to);
    return this.http.get<ChatSessionListResponse>(
      this.endpoint("/chat/sessions"),
      { ...this.workspaceOptions(workspaceId), params },
    );
  }

  createSession(
    request: ChatSessionCreateRequest,
  ): Observable<ChatSessionSummary> {
    return this.http.post<ChatSessionSummary>(
      this.endpoint("/chat/sessions"),
      request,
      this.workspaceOptions(request.workspaceId),
    );
  }

  linkSessionCase(
    workspaceId: string,
    sessionId: string,
    caseId: string | null,
  ): Observable<ChatSessionSummary> {
    return this.http.post<ChatSessionSummary>(
      this.endpoint(`/chat/sessions/${sessionId}/case`),
      { caseId },
      this.workspaceOptions(workspaceId),
    );
  }

  previewBrief(
    workspaceId: string,
    sessionId: string,
    briefId: string,
  ): Observable<BriefApplyPreview> {
    return this.http.post<BriefApplyPreview>(
      this.endpoint(`/chat/sessions/${sessionId}/briefs/${briefId}/preview`),
      {},
      this.workspaceOptions(workspaceId),
    );
  }

  applyBrief(
    workspaceId: string,
    sessionId: string,
    briefId: string,
    body: BriefApplyRequest,
  ): Observable<BriefApplyResponse> {
    return this.http.post<BriefApplyResponse>(
      this.endpoint(`/chat/sessions/${sessionId}/briefs/${briefId}/apply`),
      body,
      this.workspaceOptions(workspaceId),
    );
  }

  previewBriefTasks(
    workspaceId: string,
    sessionId: string,
    briefId: string,
  ): Observable<BriefTaskPreview> {
    return this.http.post<BriefTaskPreview>(
      this.endpoint(
        `/chat/sessions/${sessionId}/briefs/${briefId}/task-preview`,
      ),
      {},
      this.workspaceOptions(workspaceId),
    );
  }

  applyBriefTasks(
    workspaceId: string,
    sessionId: string,
    briefId: string,
    body: BriefTaskApplyRequest,
  ): Observable<BriefTaskApplyResponse> {
    return this.http.post<BriefTaskApplyResponse>(
      this.endpoint(`/chat/sessions/${sessionId}/briefs/${briefId}/tasks`),
      body,
      this.workspaceOptions(workspaceId),
    );
  }

  caseLinks(
    workspaceId: string,
    caseId: string,
    query: CaseLinksQuery = {},
  ): Observable<CaseLinksResponse> {
    return this.http.get<CaseLinksResponse>(
      this.endpoint(`/chat/cases/${caseId}/links`),
      {
        ...this.workspaceOptions(workspaceId),
        params: queryParams(query),
      },
    );
  }

  getSession(
    workspaceId: string,
    sessionId: string,
  ): Observable<ChatSessionDetail> {
    return this.http.get<ChatSessionDetail>(
      this.endpoint(`/chat/sessions/${sessionId}`),
      this.workspaceOptions(workspaceId),
    );
  }

  updateSession(
    workspaceId: string,
    sessionId: string,
    title: string,
  ): Observable<ChatSessionSummary> {
    return this.http.patch<ChatSessionSummary>(
      this.endpoint(`/chat/sessions/${sessionId}`),
      { title },
      this.workspaceOptions(workspaceId),
    );
  }

  deleteSession(
    workspaceId: string,
    sessionId: string,
  ): Observable<ChatSessionSummary> {
    return this.http.delete<ChatSessionSummary>(
      this.endpoint(`/chat/sessions/${sessionId}`),
      this.workspaceOptions(workspaceId),
    );
  }

  sendMessage(
    workspaceId: string,
    sessionId: string,
    content: string,
    files: File[] = [],
  ): Observable<ChatSendMessageResponse> {
    const body = new FormData();
    body.append("content", content);
    for (const file of files) {
      body.append("files", file);
    }
    return this.http.post<ChatSendMessageResponse>(
      this.endpoint(`/chat/sessions/${sessionId}/messages`),
      body,
      this.workspaceOptions(workspaceId),
    );
  }

  downloadUrl(workspaceId: string, attachmentId: string): string {
    const config = getRuntimeConfig();
    const url = new URL(
      `${config.apiUrl}${config.apiPrefix}/chat/attachments/${attachmentId}`,
    );
    url.searchParams.set("workspaceId", workspaceId);
    return url.toString();
  }

  listDrafts(
    workspaceId: string,
    sessionId: string,
  ): Observable<DraftResultResponse[]> {
    return this.http.get<DraftResultResponse[]>(
      this.endpoint(`/chat/drafts?sessionId=${encodeURIComponent(sessionId)}`),
      this.workspaceOptions(workspaceId),
    );
  }

  getDraft(
    workspaceId: string,
    jobId: string,
    script: DocumentScript = "latin",
  ): Observable<DraftResultResponse> {
    return this.http.get<DraftResultResponse>(
      this.endpoint(`/chat/jobs/${jobId}/draft?script=${script}`),
      this.workspaceOptions(workspaceId),
    );
  }

  retryJob(
    workspaceId: string,
    jobId: string,
  ): Observable<WorkflowJobResponse> {
    return this.http.post<WorkflowJobResponse>(
      this.endpoint(`/chat/jobs/${jobId}/retry`),
      {},
      this.workspaceOptions(workspaceId),
    );
  }

  updateMessageFeedback(
    workspaceId: string,
    messageId: string,
    feedback: ChatMessageFeedback | null,
  ): Observable<ChatMessageResponse> {
    return this.http.patch<ChatMessageResponse>(
      this.endpoint(`/chat/messages/${messageId}/feedback`),
      { feedback },
      this.workspaceOptions(workspaceId),
    );
  }

  approvePendingAction(
    workspaceId: string,
    actionId: string,
  ): Observable<PendingActionSummary> {
    return this.http.post<PendingActionSummary>(
      this.endpoint(`/chat/pending-actions/${actionId}/approve`),
      {},
      this.workspaceOptions(workspaceId),
    );
  }

  declinePendingAction(
    workspaceId: string,
    actionId: string,
    reason?: string,
  ): Observable<PendingActionSummary> {
    return this.http.post<PendingActionSummary>(
      this.endpoint(`/chat/pending-actions/${actionId}/decline`),
      reason ? { reason } : {},
      this.workspaceOptions(workspaceId),
    );
  }

  regenerateAnswer(
    workspaceId: string,
    messageId: string,
  ): Observable<WorkflowJobResponse> {
    return this.http.post<WorkflowJobResponse>(
      this.endpoint(`/chat/messages/${messageId}/regenerate`),
      {},
      this.workspaceOptions(workspaceId),
    );
  }

  exportUrl(
    workspaceId: string,
    draftId: string,
    script: DocumentScript = "cyrillic",
  ): string {
    const url = new URL(this.endpoint(`/chat/drafts/${draftId}/export`));
    url.searchParams.set("workspaceId", workspaceId);
    url.searchParams.set("format", "docx");
    url.searchParams.set("script", script);
    return url.toString();
  }

  updateDraft(
    workspaceId: string,
    draftId: string,
    finalDocumentText: string,
  ): Observable<DraftResultResponse> {
    return this.http.patch<DraftResultResponse>(
      this.endpoint(`/chat/drafts/${draftId}`),
      { finalDocumentText },
      this.workspaceOptions(workspaceId),
    );
  }

  approveDraft(
    workspaceId: string,
    draftId: string,
    note?: string,
  ): Observable<DraftResultResponse> {
    return this.http.post<DraftResultResponse>(
      this.endpoint(`/chat/drafts/${draftId}/approve`),
      { note: note ?? "" },
      this.workspaceOptions(workspaceId),
    );
  }

  rejectDraft(
    workspaceId: string,
    draftId: string,
    note?: string,
  ): Observable<DraftResultResponse> {
    return this.http.post<DraftResultResponse>(
      this.endpoint(`/chat/drafts/${draftId}/reject`),
      { note: note ?? "" },
      this.workspaceOptions(workspaceId),
    );
  }

  requestChangesDraft(
    workspaceId: string,
    draftId: string,
    note?: string,
  ): Observable<DraftResultResponse> {
    return this.http.post<DraftResultResponse>(
      this.endpoint(`/chat/drafts/${draftId}/request-changes`),
      { note: note ?? "" },
      this.workspaceOptions(workspaceId),
    );
  }

  eventsUrl(workspaceId: string, sessionId: string, after?: string): string {
    const config = getRuntimeConfig();
    return chatEventsUrl(
      config.apiUrl,
      config.apiPrefix,
      workspaceId,
      sessionId,
      after,
    );
  }

  workspaceEventsUrl(workspaceId: string): string {
    const config = getRuntimeConfig();
    return workspaceChatEventsUrl(config.apiUrl, config.apiPrefix, workspaceId);
  }
}

@Injectable({ providedIn: "root" })
export class UserSettingsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  get(): Observable<UserSettingsResponse> {
    return this.http.get<UserSettingsResponse>(
      this.endpoint("/users/me/settings"),
      { withCredentials: true },
    );
  }

  update(request: UserSettingsUpdateRequest): Observable<UserSettingsResponse> {
    return this.http.patch<UserSettingsResponse>(
      this.endpoint("/users/me/settings"),
      request,
      { withCredentials: true },
    );
  }

  clearConversationHistory(): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(
      this.endpoint("/users/me/conversations"),
      { withCredentials: true },
    );
  }

  meAvatar(body: FormData): Observable<{ avatarUrl: string }> {
    return this.http.post<{ avatarUrl: string }>(
      this.endpoint("/users/me/avatar"),
      body,
      { withCredentials: true },
    );
  }

  deleteAvatar(): Observable<{ avatarUrl: null }> {
    return this.http.delete<{ avatarUrl: null }>(
      this.endpoint("/users/me/avatar"),
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class NotificationsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(page = 1, pageSize = 10): Observable<NotificationListResponse> {
    return this.http.get<NotificationListResponse>(
      this.endpoint("/notifications"),
      {
        withCredentials: true,
        params: new HttpParams().set("page", page).set("pageSize", pageSize),
      },
    );
  }

  unreadCount(): Observable<NotificationUnreadCountResponse> {
    return this.http.get<NotificationUnreadCountResponse>(
      this.endpoint("/notifications/unread-count"),
      { withCredentials: true },
    );
  }

  markRead(id: string): Observable<NotificationDto> {
    return this.http.patch<NotificationDto>(
      this.endpoint(`/notifications/${id}/read`),
      {},
      { withCredentials: true },
    );
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http.patch<{ updated: number }>(
      this.endpoint("/notifications/read-all"),
      {},
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class WorkspacesApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(): Observable<
    Array<{ id: string; name: string; tenantId?: string | null; role?: string }>
  > {
    return this.http.get<
      Array<{
        id: string;
        name: string;
        tenantId?: string | null;
        role?: string;
      }>
    >(this.endpoint("/workspaces"), { withCredentials: true });
  }
}

@Injectable({ providedIn: "root" })
export class OrganizationSettingsApiClient {
  private readonly http = inject(HttpClient);
  private endpoint(path = ""): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}/organization-settings${path}`;
  }
  get(): Observable<OrganizationSettings> {
    return this.http.get<OrganizationSettings>(this.endpoint(), {
      withCredentials: true,
    });
  }
  updateCompany(body: CompanySettings): Observable<CompanySettings> {
    return this.put("/company", body);
  }
  updateTax(body: TaxSettings): Observable<TaxSettings> {
    return this.put("/tax", body);
  }
  updateSef(
    body: Pick<SefSettings, "enabled" | "environment">,
  ): Observable<SefSettings> {
    return this.put("/sef", body);
  }
  replaceSefApiKey(apiKey: string): Observable<SefSettings> {
    return this.put("/sef/api-key", { apiKey });
  }
  removeSefApiKey(): Observable<SefSettings> {
    return this.http.delete<SefSettings>(this.endpoint("/sef/api-key"), {
      withCredentials: true,
    });
  }
  updateInvoiceNumbering(
    body: InvoiceNumberingSettings,
  ): Observable<InvoiceNumberingSettings> {
    return this.put("/invoice-numbering", body);
  }
  updatePayment(body: PaymentSettings): Observable<PaymentSettings> {
    return this.put("/payment", body);
  }
  updateCurrency(body: CurrencySettings): Observable<CurrencySettings> {
    return this.put("/currency", body);
  }
  updateInvoiceDefaults(
    body: InvoiceDefaultsSettings,
  ): Observable<InvoiceDefaultsSettings> {
    return this.put("/invoice-defaults", body);
  }
  updatePaymentQr(
    body: InvoicePaymentQrSettings,
  ): Observable<InvoicePaymentQrSettings> {
    return this.put("/payment-qr", body);
  }
  updateSefAttachments(
    body: SefAttachmentSettings,
  ): Observable<SefAttachmentSettings> {
    return this.put("/sef-attachments", body);
  }
  createBankAccount(body: BankAccountRequest): Observable<BankAccount> {
    return this.http.post<BankAccount>(this.endpoint("/bank-accounts"), body, {
      withCredentials: true,
    });
  }
  updateBankAccount(
    id: string,
    body: BankAccountRequest,
  ): Observable<BankAccount> {
    return this.put(`/bank-accounts/${id}`, body);
  }
  archiveBankAccount(id: string): Observable<{ archived: true }> {
    return this.http.delete<{ archived: true }>(
      this.endpoint(`/bank-accounts/${id}`),
      { withCredentials: true },
    );
  }
  private put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.endpoint(path), body, {
      withCredentials: true,
    });
  }
}

export interface ClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  status?: ClientStatus;
  type?: ClientType;
  responsibleUserId?: string;
  tags?: string[];
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
  responsibleUserId?: string;
  caseTypeId?: string;
  practiceAreaId?: string;
  tags?: string[];
}

export interface ClientRequest {
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
  tagIds?: string[];
}

export interface CaseRequest {
  clientId: string;
  caseNumber: string;
  name: string;
  responsibleUserId: string;
  description?: string;
  caseTypeId?: string;
  practiceAreaId?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  openedDate?: string;
  externalReference?: string;
  confidentialityLevel?: string;
  tagIds?: string[];
  opposingPartyName?: string;
  opposingPartyAddress?: string;
}

export interface ActivityRequest {
  type: "NOTE" | "PHONE_CALL" | "MEETING" | "EMAIL" | "OTHER";
  title: string;
  description?: string;
  activityDate: string;
  relatedCaseId?: string;
  /** Create only: minutes spent, which records a billable work entry. */
  durationMinutes?: number;
}

export interface ClientAddressRequest {
  addressType: string;
  street: string;
  streetAdditional?: string;
  city: string;
  postalCode: string;
  stateOrRegion?: string;
  country: string;
  note?: string;
  isPrimary?: boolean;
}

export interface ClientIdentificationDocumentRequest {
  type: string;
  number: string;
  issuedDate?: string;
  expiredDate?: string;
  country: string;
}

export interface ClientIdentificationDocument {
  id: string;
  clientId: string;
  type: string;
  number: string;
  country: string;
  issuedDate: string | null;
  expiredDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactRequest {
  firstName: string;
  lastName: string;
  position?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface ClientActivityQuery {
  page?: number;
  pageSize?: number;
  type?: ActivityRequest["type"];
  includeCaseActivities?: boolean;
}

export interface CaseCloseRequest {
  closedDate: string;
  closingNote?: string;
}

export interface CaseResponsibilityRequest {
  userId: string;
  isPrimary?: boolean;
  startedAt?: string;
}

export interface CaseActivityQuery extends PaginationQuery {
  types?: ActivityRequest["type"][];
}

export type CaseResponsibilityQuery = PaginationQuery;

export interface CaseLinksQuery {
  page?: number;
  draftPage?: number;
  pageSize?: number;
}

export interface CaseLinksResponse {
  sessions: PaginatedResponse<{
    id: string;
    title: string | null;
    updatedAt: string;
  }>;
  drafts: PaginatedResponse<{
    id: string;
    sessionId: string;
    approvalStatus: string;
    reviewedAt: string | null;
    createdAt: string;
  }>;
}

export interface CaseResponsibilityUpdateRequest {
  startedAt?: string;
}

export interface DomainActivity {
  id: string;
  type: ActivityRequest["type"];
  title: string;
  description: string | null;
  activityDate: string;
  source: "MANUAL" | "SYSTEM" | "AI";
  relatedCaseId?: string | null;
}

export interface ClientAddress extends ClientAddressRequest {
  id: string;
  isPrimary: boolean;
}

export interface ClientContact extends ClientContactRequest {
  id: string;
  status: string;
  isPrimary: boolean;
}

export interface CaseResponsibility {
  id: string;
  userId: string;
  isPrimary: boolean;
  startedAt: string;
  endedAt: string | null;
}

function queryParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(
    query as Record<string, string | number | boolean | string[] | undefined>,
  )) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params = params.append(key, item);
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: "root" })
export class ClientsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(query: ClientListQuery = {}): Observable<ClientListResponse> {
    return this.http.get<ClientListResponse>(this.endpoint("/clients"), {
      withCredentials: true,
      params: queryParams(query),
    });
  }

  get(clientId: string): Observable<ClientDetail> {
    return this.http.get<ClientDetail>(this.endpoint(`/clients/${clientId}`), {
      withCredentials: true,
    });
  }

  create(request: ClientRequest): Observable<ClientDetail> {
    return this.http.post<ClientDetail>(this.endpoint("/clients"), request, {
      withCredentials: true,
    });
  }

  update(
    clientId: string,
    request: Partial<ClientRequest>,
  ): Observable<ClientDetail> {
    return this.http.patch<ClientDetail>(
      this.endpoint(`/clients/${clientId}`),
      request,
      { withCredentials: true },
    );
  }

  archive(clientId: string): Observable<ClientDetail> {
    return this.http.post<ClientDetail>(
      this.endpoint(`/clients/${clientId}/archive`),
      {},
      { withCredentials: true },
    );
  }

  activate(clientId: string): Observable<ClientDetail> {
    return this.http.post<ClientDetail>(
      this.endpoint(`/clients/${clientId}/activate`),
      {},
      { withCredentials: true },
    );
  }

  listCases(
    clientId: string,
    query: Pick<
      CaseListQuery,
      "page" | "pageSize" | "search" | "sort" | "status" | "priority"
    > = {},
  ): Observable<CaseListResponse> {
    return this.http.get<CaseListResponse>(
      this.endpoint(`/clients/${clientId}/cases`),
      { withCredentials: true, params: queryParams(query) },
    );
  }

  listAddresses(clientId: string): Observable<ClientAddress[]> {
    return this.http.get<ClientAddress[]>(
      this.endpoint(`/clients/${clientId}/addresses`),
      { withCredentials: true },
    );
  }

  listIdentificationDocuments(
    clientId: string,
  ): Observable<ClientIdentificationDocument[]> {
    return this.http.get<ClientIdentificationDocument[]>(
      this.endpoint(`/clients/${clientId}/identification-documents`),
      { withCredentials: true },
    );
  }

  createIdentificationDocument(
    clientId: string,
    request: ClientIdentificationDocumentRequest,
  ): Observable<ClientIdentificationDocument> {
    return this.http.post<ClientIdentificationDocument>(
      this.endpoint(`/clients/${clientId}/identification-documents`),
      request,
      { withCredentials: true },
    );
  }

  updateIdentificationDocument(
    clientId: string,
    documentId: string,
    request: ClientIdentificationDocumentRequest,
  ): Observable<ClientIdentificationDocument> {
    return this.http.patch<ClientIdentificationDocument>(
      this.endpoint(
        `/clients/${clientId}/identification-documents/${documentId}`,
      ),
      request,
      { withCredentials: true },
    );
  }

  removeIdentificationDocument(
    clientId: string,
    documentId: string,
  ): Observable<void> {
    return this.http.delete<void>(
      this.endpoint(
        `/clients/${clientId}/identification-documents/${documentId}`,
      ),
      { withCredentials: true },
    );
  }

  createAddress(
    clientId: string,
    request: ClientAddressRequest,
  ): Observable<ClientAddress> {
    return this.http.post<ClientAddress>(
      this.endpoint(`/clients/${clientId}/addresses`),
      request,
      { withCredentials: true },
    );
  }

  updateAddress(
    clientId: string,
    addressId: string,
    request: ClientAddressRequest,
  ): Observable<ClientAddress> {
    return this.http.patch<ClientAddress>(
      this.endpoint(`/clients/${clientId}/addresses/${addressId}`),
      request,
      { withCredentials: true },
    );
  }

  removeAddress(clientId: string, addressId: string): Observable<void> {
    return this.http.delete<void>(
      this.endpoint(`/clients/${clientId}/addresses/${addressId}`),
      { withCredentials: true },
    );
  }

  listContacts(clientId: string): Observable<ClientContact[]> {
    return this.http.get<ClientContact[]>(
      this.endpoint(`/clients/${clientId}/contacts`),
      { withCredentials: true },
    );
  }

  createContact(
    clientId: string,
    request: ClientContactRequest,
  ): Observable<ClientContact> {
    return this.http.post<ClientContact>(
      this.endpoint(`/clients/${clientId}/contacts`),
      request,
      { withCredentials: true },
    );
  }

  updateContact(
    clientId: string,
    contactId: string,
    request: Partial<ClientContactRequest>,
  ): Observable<ClientContact> {
    return this.http.patch<ClientContact>(
      this.endpoint(`/clients/${clientId}/contacts/${contactId}`),
      request,
      { withCredentials: true },
    );
  }

  deactivateContact(
    clientId: string,
    contactId: string,
  ): Observable<ClientContact> {
    return this.http.post<ClientContact>(
      this.endpoint(`/clients/${clientId}/contacts/${contactId}/deactivate`),
      {},
      { withCredentials: true },
    );
  }

  listActivities(
    clientId: string,
    query: ClientActivityQuery = {},
  ): Observable<{ items: DomainActivity[]; meta: ClientListResponse["meta"] }> {
    return this.http.get<{
      items: DomainActivity[];
      meta: ClientListResponse["meta"];
    }>(this.endpoint(`/clients/${clientId}/activities`), {
      withCredentials: true,
      params: queryParams(query),
    });
  }

  createActivity(
    clientId: string,
    request: ActivityRequest,
  ): Observable<DomainActivity> {
    return this.http.post<DomainActivity>(
      this.endpoint(`/clients/${clientId}/activities`),
      request,
      { withCredentials: true },
    );
  }

  updateActivity(
    clientId: string,
    activityId: string,
    request: Partial<Omit<ActivityRequest, "durationMinutes">>,
  ): Observable<DomainActivity> {
    return this.http.patch<DomainActivity>(
      this.endpoint(`/clients/${clientId}/activities/${activityId}`),
      request,
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class CalendarApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(query: CalendarQuery): Observable<CalendarResponse> {
    return this.http.get<CalendarResponse>(this.endpoint("/calendar"), {
      withCredentials: true,
      params: queryParams(query),
    });
  }
}

@Injectable({ providedIn: "root" })
export class EventsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(query: EventListQuery = {}): Observable<PaginatedResponse<EventDetail>> {
    return this.http.get<PaginatedResponse<EventDetail>>(
      this.endpoint("/events"),
      {
        withCredentials: true,
        params: queryParams(query),
      },
    );
  }

  get(eventId: string): Observable<EventDetail> {
    return this.http.get<EventDetail>(this.endpoint(`/events/${eventId}`), {
      withCredentials: true,
    });
  }

  create(request: EventRequest): Observable<EventDetail> {
    return this.http.post<EventDetail>(this.endpoint("/events"), request, {
      withCredentials: true,
    });
  }

  update(eventId: string, request: EventRequest): Observable<EventDetail> {
    return this.http.patch<EventDetail>(
      this.endpoint(`/events/${eventId}`),
      request,
      {
        withCredentials: true,
      },
    );
  }

  complete(eventId: string): Observable<EventDetail> {
    return this.http.post<EventDetail>(
      this.endpoint(`/events/${eventId}/complete`),
      {},
      {
        withCredentials: true,
      },
    );
  }

  cancel(eventId: string): Observable<EventDetail> {
    return this.http.post<EventDetail>(
      this.endpoint(`/events/${eventId}/cancel`),
      {},
      {
        withCredentials: true,
      },
    );
  }
}

@Injectable({ providedIn: "root" })
export class WorkManagementApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  listTasks(
    query: TaskListQuery = {},
  ): Observable<PaginatedResponse<TaskDetail>> {
    return this.http.get<PaginatedResponse<TaskDetail>>(
      this.endpoint("/tasks"),
      {
        withCredentials: true,
        params: queryParams(query),
      },
    );
  }

  getTask(id: string): Observable<TaskDetail> {
    return this.http.get<TaskDetail>(this.endpoint(`/tasks/${id}`), {
      withCredentials: true,
    });
  }

  createTask(request: TaskRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(this.endpoint("/tasks"), request, {
      withCredentials: true,
    });
  }

  updateTask(id: string, request: TaskRequest): Observable<TaskDetail> {
    return this.http.patch<TaskDetail>(this.endpoint(`/tasks/${id}`), request, {
      withCredentials: true,
    });
  }

  completeTask(id: string): Observable<TaskDetail> {
    return this.transitionTask(id, "complete");
  }

  cancelTask(id: string): Observable<TaskDetail> {
    return this.transitionTask(id, "cancel");
  }

  reopenTask(id: string): Observable<TaskDetail> {
    return this.transitionTask(id, "reopen");
  }

  listDeadlines(
    query: DeadlineListQuery = {},
  ): Observable<PaginatedResponse<DeadlineDetail>> {
    return this.http.get<PaginatedResponse<DeadlineDetail>>(
      this.endpoint("/deadlines"),
      {
        withCredentials: true,
        params: queryParams(query),
      },
    );
  }

  getDeadline(id: string): Observable<DeadlineDetail> {
    return this.http.get<DeadlineDetail>(this.endpoint(`/deadlines/${id}`), {
      withCredentials: true,
    });
  }

  createDeadline(request: DeadlineRequest): Observable<DeadlineDetail> {
    return this.http.post<DeadlineDetail>(
      this.endpoint("/deadlines"),
      request,
      {
        withCredentials: true,
      },
    );
  }

  updateDeadline(
    id: string,
    request: DeadlineRequest,
  ): Observable<DeadlineDetail> {
    return this.http.patch<DeadlineDetail>(
      this.endpoint(`/deadlines/${id}`),
      request,
      {
        withCredentials: true,
      },
    );
  }

  satisfyDeadline(id: string): Observable<DeadlineDetail> {
    return this.transitionDeadline(id, "satisfy");
  }

  cancelDeadline(id: string): Observable<DeadlineDetail> {
    return this.transitionDeadline(id, "cancel");
  }

  reopenDeadline(id: string): Observable<DeadlineDetail> {
    return this.transitionDeadline(id, "reopen");
  }

  listActivity(
    query: ActivityLogListQuery = {},
  ): Observable<PaginatedResponse<ActivityLogSummary>> {
    return this.http.get<PaginatedResponse<ActivityLogSummary>>(
      this.endpoint("/activity-log"),
      {
        withCredentials: true,
        params: queryParams(query),
      },
    );
  }

  private transitionTask(
    id: string,
    action: "complete" | "cancel" | "reopen",
  ): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(
      this.endpoint(`/tasks/${id}/${action}`),
      {},
      {
        withCredentials: true,
      },
    );
  }

  private transitionDeadline(
    id: string,
    action: "satisfy" | "cancel" | "reopen",
  ): Observable<DeadlineDetail> {
    return this.http.post<DeadlineDetail>(
      this.endpoint(`/deadlines/${id}/${action}`),
      {},
      {
        withCredentials: true,
      },
    );
  }
}

@Injectable({ providedIn: "root" })
export class CasesApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(query: CaseListQuery = {}): Observable<CaseListResponse> {
    return this.http.get<CaseListResponse>(this.endpoint("/cases"), {
      withCredentials: true,
      params: queryParams(query),
    });
  }

  get(caseId: string): Observable<CaseDetail> {
    return this.http.get<CaseDetail>(this.endpoint(`/cases/${caseId}`), {
      withCredentials: true,
    });
  }

  nextNumber(format: CaseNumberFormat): Observable<CaseNextNumberResponse> {
    return this.http.get<CaseNextNumberResponse>(
      this.endpoint("/cases/next-number"),
      {
        withCredentials: true,
        params: new HttpParams().set("format", format),
      },
    );
  }

  create(request: CaseRequest): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(this.endpoint("/cases"), request, {
      withCredentials: true,
    });
  }

  update(
    caseId: string,
    request: Partial<CaseRequest>,
  ): Observable<CaseDetail> {
    return this.http.patch<CaseDetail>(
      this.endpoint(`/cases/${caseId}`),
      request,
      { withCredentials: true },
    );
  }

  activate(caseId: string): Observable<CaseDetail> {
    return this.lifecycle(caseId, "activate");
  }
  putOnHold(caseId: string): Observable<CaseDetail> {
    return this.lifecycle(caseId, "put-on-hold");
  }
  resume(caseId: string): Observable<CaseDetail> {
    return this.lifecycle(caseId, "resume");
  }
  reopen(caseId: string): Observable<CaseDetail> {
    return this.lifecycle(caseId, "reopen");
  }
  archive(caseId: string): Observable<CaseDetail> {
    return this.lifecycle(caseId, "archive");
  }

  close(caseId: string, request: CaseCloseRequest): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(
      this.endpoint(`/cases/${caseId}/close`),
      request,
      { withCredentials: true },
    );
  }

  listActivities(
    caseId: string,
    query: CaseActivityQuery = {},
  ): Observable<PaginatedResponse<DomainActivity>> {
    return this.http.get<PaginatedResponse<DomainActivity>>(
      this.endpoint(`/cases/${caseId}/activities`),
      { withCredentials: true, params: queryParams(query) },
    );
  }

  createActivity(
    caseId: string,
    request: Omit<ActivityRequest, "relatedCaseId">,
  ): Observable<DomainActivity> {
    return this.http.post<DomainActivity>(
      this.endpoint(`/cases/${caseId}/activities`),
      request,
      { withCredentials: true },
    );
  }

  updateActivity(
    caseId: string,
    activityId: string,
    request: Partial<
      Omit<ActivityRequest, "relatedCaseId" | "durationMinutes">
    >,
  ): Observable<DomainActivity> {
    return this.http.patch<DomainActivity>(
      this.endpoint(`/cases/${caseId}/activities/${activityId}`),
      request,
      { withCredentials: true },
    );
  }

  listResponsibilities(
    caseId: string,
    query: CaseResponsibilityQuery = {},
  ): Observable<PaginatedResponse<CaseResponsibility>> {
    return this.http.get<PaginatedResponse<CaseResponsibility>>(
      this.endpoint(`/cases/${caseId}/responsibilities`),
      { withCredentials: true, params: queryParams(query) },
    );
  }

  addResponsibility(
    caseId: string,
    request: CaseResponsibilityRequest,
  ): Observable<CaseResponsibility> {
    return this.http.post<CaseResponsibility>(
      this.endpoint(`/cases/${caseId}/responsibilities`),
      request,
      { withCredentials: true },
    );
  }

  updateResponsibility(
    caseId: string,
    responsibilityId: string,
    request: CaseResponsibilityUpdateRequest,
  ): Observable<CaseResponsibility> {
    return this.http.patch<CaseResponsibility>(
      this.endpoint(`/cases/${caseId}/responsibilities/${responsibilityId}`),
      request,
      { withCredentials: true },
    );
  }

  endResponsibility(
    caseId: string,
    responsibilityId: string,
  ): Observable<CaseResponsibility> {
    return this.http.post<CaseResponsibility>(
      this.endpoint(
        `/cases/${caseId}/responsibilities/${responsibilityId}/end`,
      ),
      {},
      { withCredentials: true },
    );
  }

  setPrimary(
    caseId: string,
    responsibilityId: string,
  ): Observable<CaseResponsibility> {
    return this.http.post<CaseResponsibility>(
      this.endpoint(
        `/cases/${caseId}/responsibilities/${responsibilityId}/set-primary`,
      ),
      {},
      { withCredentials: true },
    );
  }

  private lifecycle(caseId: string, action: string): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(
      this.endpoint(`/cases/${caseId}/${action}`),
      {},
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class ReferencesApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  users(): Observable<
    Array<{
      userId: string;
      role: string;
      user: {
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }>
  > {
    return this.http.get<
      Array<{
        userId: string;
        role: string;
        user: {
          firstName: string | null;
          lastName: string | null;
          email: string;
        };
      }>
    >(this.endpoint("/references/users"), { withCredentials: true });
  }

  tags(): Observable<Array<{ id: string; name: string; isActive: boolean }>> {
    return this.http.get<
      Array<{ id: string; name: string; isActive: boolean }>
    >(this.endpoint("/references/tags"), { withCredentials: true });
  }

  caseTypes(): Observable<
    Array<{ id: string; name: string; isActive: boolean }>
  > {
    return this.http.get<
      Array<{ id: string; name: string; isActive: boolean }>
    >(this.endpoint("/references/case-types"), { withCredentials: true });
  }

  createTag(
    request: ReferenceRequest,
  ): Observable<{ id: string; name: string; isActive: boolean }> {
    return this.http.post<{ id: string; name: string; isActive: boolean }>(
      this.endpoint("/references/tags"),
      request,
      { withCredentials: true },
    );
  }

  createCaseType(
    request: ReferenceRequest,
  ): Observable<{ id: string; name: string; isActive: boolean }> {
    return this.http.post<{ id: string; name: string; isActive: boolean }>(
      this.endpoint("/references/case-types"),
      request,
      { withCredentials: true },
    );
  }

  practiceAreas(): Observable<
    Array<{ id: string; name: string; isActive: boolean }>
  > {
    return this.http.get<
      Array<{ id: string; name: string; isActive: boolean }>
    >(this.endpoint("/references/practice-areas"), { withCredentials: true });
  }

  createPracticeArea(
    request: ReferenceRequest,
  ): Observable<{ id: string; name: string; isActive: boolean }> {
    return this.http.post<{ id: string; name: string; isActive: boolean }>(
      this.endpoint("/references/practice-areas"),
      request,
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class DocumentsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  browseFolders(
    parentId: string | null,
    search?: string,
  ): Observable<DocumentFolderBrowseResponse> {
    return this.http.get<DocumentFolderBrowseResponse>(
      this.endpoint("/documents/folders"),
      {
        withCredentials: true,
        params: queryParams({ parentId: parentId ?? undefined, search }),
      },
    );
  }

  ensureFolders(
    request: EnsureDocumentFoldersRequest,
  ): Observable<EnsureDocumentFoldersResponse> {
    return this.http.post<EnsureDocumentFoldersResponse>(
      this.endpoint("/documents/folders/ensure"),
      request,
      { withCredentials: true },
    );
  }

  statistics(): Observable<DocumentStatistics> {
    return this.http.get<DocumentStatistics>(
      this.endpoint("/documents/statistics"),
      { withCredentials: true },
    );
  }

  list(query: DocumentListQuery = {}): Observable<DocumentListResponse> {
    return this.http.get<DocumentListResponse>(this.endpoint("/documents"), {
      withCredentials: true,
      params: queryParams(query),
    });
  }

  get(documentId: string): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(
      this.endpoint(`/documents/${documentId}`),
      { withCredentials: true },
    );
  }

  update(
    documentId: string,
    request: DocumentUpdateRequest,
  ): Observable<DocumentDetail> {
    return this.http.patch<DocumentDetail>(
      this.endpoint(`/documents/${documentId}`),
      request,
      { withCredentials: true },
    );
  }

  listVersions(
    documentId: string,
    query: PaginationQuery = {},
  ): Observable<DocumentVersionListResponse> {
    return this.http.get<DocumentVersionListResponse>(
      this.endpoint(`/documents/${documentId}/versions`),
      { withCredentials: true, params: queryParams(query) },
    );
  }

  archive(documentId: string): Observable<DocumentDetail> {
    return this.http.post<DocumentDetail>(
      this.endpoint(`/documents/${documentId}/archive`),
      {},
      { withCredentials: true },
    );
  }

  restore(documentId: string): Observable<DocumentDetail> {
    return this.http.post<DocumentDetail>(
      this.endpoint(`/documents/${documentId}/restore`),
      {},
      { withCredentials: true },
    );
  }

  downloadUrl(documentId: string, versionId?: string): string {
    if (versionId) {
      return this.endpoint(
        `/documents/${documentId}/versions/${versionId}/download`,
      );
    }
    return this.endpoint(`/documents/${documentId}/download`);
  }

  create(
    body: FormData,
    idempotencyKey: string,
    options?: { context?: HttpContext },
  ): Observable<HttpEvent<DocumentDetail>> {
    return this.http.post<DocumentDetail>(this.endpoint("/documents"), body, {
      withCredentials: true,
      observe: "events",
      reportProgress: true,
      headers: { "Idempotency-Key": idempotencyKey },
      context: options?.context,
    });
  }

  addVersion(
    documentId: string,
    body: FormData,
    idempotencyKey: string,
    options?: { context?: HttpContext },
  ): Observable<HttpEvent<DocumentDetail>> {
    return this.http.post<DocumentDetail>(
      this.endpoint(`/documents/${documentId}/versions`),
      body,
      {
        withCredentials: true,
        observe: "events",
        reportProgress: true,
        headers: { "Idempotency-Key": idempotencyKey },
        context: options?.context,
      },
    );
  }
}

@Injectable({ providedIn: "root" })
export class FinancialsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  invoices(): Observable<InvoiceSummary[]> {
    return this.http.get<InvoiceSummary[]>(
      this.endpoint("/financials/invoices"),
      { withCredentials: true },
    );
  }

  suggestInvoiceNumber(date?: string): Observable<InvoiceNumberSuggestion> {
    return this.http.get<InvoiceNumberSuggestion>(
      this.endpoint("/financials/invoices/number-suggestion"),
      {
        withCredentials: true,
        params: date ? new HttpParams().set("date", date) : undefined,
      },
    );
  }

  createInvoice(body: CreateInvoiceRequest): Observable<Invoice> {
    return this.http.post<Invoice>(
      this.endpoint("/financials/invoices"),
      body,
      { withCredentials: true },
    );
  }

  invoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(this.endpoint(`/financials/invoices/${id}`), {
      withCredentials: true,
    });
  }

  updateInvoice(id: string, body: UpdateInvoiceRequest): Observable<Invoice> {
    return this.http.patch<Invoice>(
      this.endpoint(`/financials/invoices/${id}`),
      body,
      { withCredentials: true },
    );
  }

  deleteInvoice(id: string): Observable<void> {
    return this.http.delete<void>(this.endpoint(`/financials/invoices/${id}`), {
      withCredentials: true,
    });
  }

  /** Marks a draft as sent; the API answers 409 while a line still needs a price. */
  sendInvoice(id: string): Observable<Invoice> {
    return this.http.post<Invoice>(
      this.endpoint(`/financials/invoices/${id}/send`),
      {},
      { withCredentials: true },
    );
  }

  sefState(id: string): Observable<InvoiceSefStateResponse> {
    return this.http.get<InvoiceSefStateResponse>(
      this.endpoint(`/financials/invoices/${id}/sef`),
      { withCredentials: true },
    );
  }

  validateSefInvoice(
    id: string,
    body: InvoiceSefRequest = {},
  ): Observable<SefValidationResult> {
    return this.http.post<SefValidationResult>(
      this.endpoint(`/financials/invoices/${id}/sef/validate`),
      body,
      { withCredentials: true },
    );
  }

  downloadSefUbl(id: string, bankAccountId?: string): Observable<Blob> {
    let params = new HttpParams();
    if (bankAccountId) params = params.set("bankAccountId", bankAccountId);
    return this.http.get(this.endpoint(`/financials/invoices/${id}/sef/ubl`), {
      withCredentials: true,
      params,
      responseType: "blob",
    });
  }

  sendToDemoSef(
    id: string,
    idempotencyKey: string,
    body: InvoiceSefRequest = {},
  ): Observable<InvoiceSefSubmission> {
    return this.http.post<InvoiceSefSubmission>(
      this.endpoint(`/financials/invoices/${id}/sef/send`),
      body,
      { withCredentials: true, headers: { "Idempotency-Key": idempotencyKey } },
    );
  }

  refreshSefStatus(id: string): Observable<InvoiceSefSubmission> {
    return this.http.post<InvoiceSefSubmission>(
      this.endpoint(`/financials/invoices/${id}/sef/refresh`),
      {},
      { withCredentials: true },
    );
  }

  priceSources(): Observable<PriceSourceSummary[]> {
    return this.http.get<PriceSourceSummary[]>(
      this.endpoint("/financials/price-sources"),
      { withCredentials: true },
    );
  }

  createPriceSource(body: {
    scope: PriceSourceScope;
    title: string;
    rawText: string;
    clientId?: string;
    caseId?: string;
    sourceUrl?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    publishedAt?: string;
  }): Observable<PriceSourceVersion & { priceSource: PriceSourceSummary }> {
    return this.http.post<
      PriceSourceVersion & { priceSource: PriceSourceSummary }
    >(this.endpoint("/financials/price-sources"), body, {
      withCredentials: true,
    });
  }

  appendPriceSourceVersion(
    sourceId: string,
    rawText: string,
  ): Observable<PriceSourceVersion> {
    return this.http.post<PriceSourceVersion>(
      this.endpoint(`/financials/price-sources/${sourceId}/versions`),
      { rawText },
      { withCredentials: true },
    );
  }

  priceSourceVersions(sourceId: string): Observable<PriceSourceVersion[]> {
    return this.http.get<PriceSourceVersion[]>(
      this.endpoint(`/financials/price-sources/${sourceId}/versions`),
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class WorkEntriesApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}${path}`;
  }

  list(
    query: Partial<WorkEntryQuery> = {},
  ): Observable<PaginatedResponse<WorkEntry>> {
    return this.http.get<PaginatedResponse<WorkEntry>>(
      this.endpoint("/work-entries"),
      { withCredentials: true, params: queryParams(query) },
    );
  }

  get(id: string): Observable<WorkEntry> {
    return this.http.get<WorkEntry>(this.endpoint(`/work-entries/${id}`), {
      withCredentials: true,
    });
  }

  create(body: CreateWorkEntryRequest): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(this.endpoint("/work-entries"), body, {
      withCredentials: true,
    });
  }

  update(id: string, body: UpdateWorkEntryRequest): Observable<WorkEntry> {
    return this.http.patch<WorkEntry>(
      this.endpoint(`/work-entries/${id}`),
      body,
      { withCredentials: true },
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.endpoint(`/work-entries/${id}`), {
      withCredentials: true,
    });
  }

  confirm(id: string, body: ConfirmWorkEntryRequest): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(
      this.endpoint(`/work-entries/${id}/confirm`),
      body,
      { withCredentials: true },
    );
  }

  writeOff(id: string, body: WriteOffWorkEntryRequest): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(
      this.endpoint(`/work-entries/${id}/write-off`),
      body,
      { withCredentials: true },
    );
  }

  runningTimer(): Observable<WorkEntry | null> {
    return this.http.get<WorkEntry | null>(
      this.endpoint("/work-entries/timer"),
      {
        withCredentials: true,
      },
    );
  }

  startTimer(body: StartTimerRequest): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(
      this.endpoint("/work-entries/timer/start"),
      body,
      { withCredentials: true },
    );
  }

  stopTimer(): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(
      this.endpoint("/work-entries/timer/stop"),
      {},
      { withCredentials: true },
    );
  }

  confirmFromSource(body: ConfirmSourceEntryRequest): Observable<WorkEntry> {
    return this.http.post<WorkEntry>(
      this.endpoint("/work-entries/from-source"),
      body,
      { withCredentials: true },
    );
  }

  parse(body: WorkCaptureParseRequest): Observable<WorkCaptureParseResponse> {
    return this.http.post<WorkCaptureParseResponse>(
      this.endpoint("/work-entries/parse"),
      body,
      { withCredentials: true },
    );
  }

  /** `date` is a YYYY-MM-DD calendar day in the office time zone. */
  review(date: string): Observable<TimeReviewResponse> {
    return this.http.get<TimeReviewResponse>(
      this.endpoint("/work-entries/review"),
      { withCredentials: true, params: queryParams({ date }) },
    );
  }
}

@Injectable({ providedIn: "root" })
export class BillingSetupApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}/billing-setup${path}`;
  }

  listCategories(): Observable<ServiceCategory[]> {
    return this.http.get<ServiceCategory[]>(this.endpoint("/categories"), {
      withCredentials: true,
    });
  }

  createCategory(
    body: CreateServiceCategoryRequest,
  ): Observable<ServiceCategory> {
    return this.http.post<ServiceCategory>(this.endpoint("/categories"), body, {
      withCredentials: true,
    });
  }

  updateCategory(
    id: string,
    body: UpdateServiceCategoryRequest,
  ): Observable<ServiceCategory> {
    return this.http.patch<ServiceCategory>(
      this.endpoint(`/categories/${id}`),
      body,
      { withCredentials: true },
    );
  }

  listRetainers(clientId: string): Observable<RetainerAgreement[]> {
    return this.http.get<RetainerAgreement[]>(
      this.endpoint(`/clients/${clientId}/retainers`),
      { withCredentials: true },
    );
  }

  createRetainer(
    clientId: string,
    body: UpsertRetainerAgreementRequest,
  ): Observable<RetainerAgreement> {
    return this.http.post<RetainerAgreement>(
      this.endpoint(`/clients/${clientId}/retainers`),
      body,
      { withCredentials: true },
    );
  }

  updateRetainer(
    id: string,
    body: UpsertRetainerAgreementRequest,
  ): Observable<RetainerAgreement> {
    return this.http.patch<RetainerAgreement>(
      this.endpoint(`/retainers/${id}`),
      body,
      { withCredentials: true },
    );
  }

  deactivateRetainer(id: string): Observable<RetainerAgreement> {
    return this.http.post<RetainerAgreement>(
      this.endpoint(`/retainers/${id}/deactivate`),
      {},
      { withCredentials: true },
    );
  }

  getProfile(clientId: string): Observable<ClientBillingProfile> {
    return this.http.get<ClientBillingProfile>(
      this.endpoint(`/clients/${clientId}/profile`),
      { withCredentials: true },
    );
  }

  upsertProfile(
    clientId: string,
    body: Omit<ClientBillingProfile, "clientId">,
  ): Observable<ClientBillingProfile> {
    return this.http.put<ClientBillingProfile>(
      this.endpoint(`/clients/${clientId}/profile`),
      body,
      { withCredentials: true },
    );
  }

  listRates(query: { userId?: string } = {}): Observable<UserRate[]> {
    return this.http.get<UserRate[]>(this.endpoint("/rates"), {
      withCredentials: true,
      params: queryParams(query),
    });
  }

  createRate(body: CreateUserRateRequest): Observable<UserRate> {
    return this.http.post<UserRate>(this.endpoint("/rates"), body, {
      withCredentials: true,
    });
  }

  getWorkspaceConfig(): Observable<WorkspaceBillingConfig> {
    return this.http.get<WorkspaceBillingConfig>(this.endpoint("/workspace"), {
      withCredentials: true,
    });
  }

  updateWorkspaceConfig(
    body: WorkspaceBillingConfig,
  ): Observable<WorkspaceBillingConfig> {
    return this.http.put<WorkspaceBillingConfig>(
      this.endpoint("/workspace"),
      body,
      { withCredentials: true },
    );
  }
}

@Injectable({ providedIn: "root" })
export class BillingReportsApiClient {
  private readonly http = inject(HttpClient);

  private endpoint(path: string): string {
    const config = getRuntimeConfig();
    return `${config.apiUrl}${config.apiPrefix}/billing${path}`;
  }

  /** `month` is YYYY-MM. */
  usage(month: string): Observable<RetainerUsage[]> {
    return this.http.get<RetainerUsage[]>(this.endpoint("/retainers/usage"), {
      withCredentials: true,
      params: queryParams({ month }),
    });
  }

  clientUsage(
    clientId: string,
    month: string,
  ): Observable<RetainerUsage | null> {
    return this.http.get<RetainerUsage | null>(
      this.endpoint(`/clients/${clientId}/usage`),
      { withCredentials: true, params: queryParams({ month }) },
    );
  }

  precheck(month: string): Observable<MonthEndPrecheck> {
    return this.http.get<MonthEndPrecheck>(
      this.endpoint(`/month-end/${month}/precheck`),
      { withCredentials: true },
    );
  }

  runMonthEnd(month: string): Observable<MonthEndRunResult> {
    return this.http.post<MonthEndRunResult>(
      this.endpoint(`/month-end/${month}/run`),
      {},
      { withCredentials: true },
    );
  }

  profitability(from: string, to: string): Observable<ProfitabilityReport> {
    return this.http.get<ProfitabilityReport>(this.endpoint("/profitability"), {
      withCredentials: true,
      params: queryParams({ from, to }),
    });
  }
}
