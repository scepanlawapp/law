import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  AuthSessionResponse,
  InvitationAcceptRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";

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
