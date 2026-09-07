import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  AuthSessionResponse,
  ChatSendMessageResponse,
  ChatSessionCreateRequest,
  ChatSessionDetail,
  ChatSessionSummary,
  InvitationAcceptRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
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

  listSessions(workspaceId: string): Observable<ChatSessionSummary[]> {
    return this.http.get<ChatSessionSummary[]>(
      this.endpoint("/chat/sessions"),
      this.workspaceOptions(workspaceId),
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
