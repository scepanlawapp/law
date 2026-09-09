import { inject, Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  AuthSessionResponse,
  ChatSendMessageResponse,
  ChatSessionCreateRequest,
  ChatSessionDetail,
  ChatSessionListResponse,
  ChatSessionSummary,
  PaginationQuery,
  InvitationAcceptRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
  UserSettingsResponse,
  UserSettingsUpdateRequest,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";
import { chatEventsUrl } from "./chat-events-url";

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
