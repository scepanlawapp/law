import { Injectable, inject, signal } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import {
  catchError,
  finalize,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { AuthSessionResponse } from "@law/api-interfaces";

@Injectable({ providedIn: "root" })
export class AuthState {
  private readonly api = inject(AuthApiClient);
  private readonly router = inject(Router);
  readonly session = signal<AuthSessionResponse | null>(null);
  readonly activeWorkspaceId = signal<string | null>(null);
  readonly loading = signal(true);

  bootstrap(): Observable<AuthSessionResponse | null> {
    return this.api.me().pipe(
      tap((session) => {
        this.session.set(session);
        this.ensureActiveWorkspace(session);
      }),
      catchError(() => of(null)),
      finalize(() => this.loading.set(false)),
    );
  }

  login(email: string, password: string) {
    return this.api
      .login({ email, password })
      .pipe(
        tap((session) => {
          this.session.set(session);
          this.ensureActiveWorkspace(session);
        }),
      );
  }

  logout() {
    return this.api.logout().pipe(
      tap(() => {
        this.session.set(null);
        this.activeWorkspaceId.set(null);
        void this.router.navigate(["/login"]);
      }),
    );
  }

  setActiveWorkspace(workspaceId: string): void {
    const current = this.session();
    const exists = current?.memberships.some((m) => m.workspaceId === workspaceId);
    if (exists) {
      this.activeWorkspaceId.set(workspaceId);
    }
  }

  private ensureActiveWorkspace(session: AuthSessionResponse | null): void {
    if (!session || !session.memberships.length) {
      this.activeWorkspaceId.set(null);
      return;
    }
    const currentActive = this.activeWorkspaceId();
    const stillValid = session.memberships.some((m) => m.workspaceId === currentActive);
    if (!currentActive || !stillValid) {
      this.activeWorkspaceId.set(session.memberships[0].workspaceId);
    }
  }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthState);
  const activeWsId = auth.activeWorkspaceId();
  const isPlatformPath =
    request.url.includes("/auth/") ||
    request.url.includes("/workspaces") ||
    request.url.includes("/users/me/settings");

  let modifiedRequest = request.clone({ withCredentials: true });
  if (activeWsId && !isPlatformPath && !request.headers.has("X-Workspace-Id")) {
    modifiedRequest = modifiedRequest.clone({
      setHeaders: { "X-Workspace-Id": activeWsId },
    });
  }

  return next(modifiedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !request.url.includes("/auth/")) {
        return inject(AuthApiClient)
          .refresh()
          .pipe(
            tap((session) => {
              auth.session.set(session);
            }),
            switchMap(() => next(modifiedRequest)),
            catchError((refreshError) => {
              auth.session.set(null);
              auth.activeWorkspaceId.set(null);
              return throwError(() => refreshError);
            }),
          );
      }
      return throwError(() => error);
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const state = inject(AuthState);
  const router = inject(Router);
  return state.session() ? true : router.createUrlTree(["/login"]);
};
