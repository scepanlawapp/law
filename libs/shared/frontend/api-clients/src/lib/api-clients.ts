import { inject, Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  AuthSessionResponse,
  ActiveWorkspaceRequest,
  ChatSendMessageResponse,
  ChatMessageFeedback,
  ChatMessageResponse,
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
  WorkflowJobResponse,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";
import { chatEventsUrl, workspaceChatEventsUrl } from "./chat-events-url";

export interface ReferenceRequest {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
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

  selectActiveWorkspace(
    request: ActiveWorkspaceRequest,
  ): Observable<AuthSessionResponse> {
    return this.http.post<AuthSessionResponse>(
      this.endpoint("/auth/active-workspace"),
      request,
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
}

export interface ActivityRequest {
  type: "NOTE" | "PHONE_CALL" | "MEETING" | "EMAIL" | "OTHER";
  title: string;
  description?: string;
  activityDate: string;
  relatedCaseId?: string;
}

export interface ClientAddressRequest {
  type?: string;
  street?: string;
  streetAdditional?: string;
  city?: string;
  postalCode?: string;
  stateOrRegion?: string;
  country?: string;
  isPrimary?: boolean;
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
    request: Partial<ActivityRequest>,
  ): Observable<DomainActivity> {
    return this.http.patch<DomainActivity>(
      this.endpoint(`/clients/${clientId}/activities/${activityId}`),
      request,
      { withCredentials: true },
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

  listActivities(caseId: string): Observable<DomainActivity[]> {
    return this.http.get<DomainActivity[]>(
      this.endpoint(`/cases/${caseId}/activities`),
      { withCredentials: true },
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
    request: Partial<Omit<ActivityRequest, "relatedCaseId">>,
  ): Observable<DomainActivity> {
    return this.http.patch<DomainActivity>(
      this.endpoint(`/cases/${caseId}/activities/${activityId}`),
      request,
      { withCredentials: true },
    );
  }

  listResponsibilities(caseId: string): Observable<CaseResponsibility[]> {
    return this.http.get<CaseResponsibility[]>(
      this.endpoint(`/cases/${caseId}/responsibilities`),
      { withCredentials: true },
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
