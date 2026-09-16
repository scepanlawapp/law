import { computed, Injectable, inject, signal } from "@angular/core";
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
import {
  ActiveWorkspace,
  AuthSessionResponse,
  CASE_NUMBER_FORMATS,
} from "@law/api-interfaces";

@Injectable({ providedIn: "root" })
export class AuthState {
  private readonly api = inject(AuthApiClient);
  private readonly router = inject(Router);
  readonly session = signal<AuthSessionResponse | null>(null);
  readonly activeWorkspace = computed<ActiveWorkspace | null>(() => {
    const session = this.session();
    const membership = session?.memberships[0];

    return session && membership
      ? {
          id: membership.workspaceId,
          organizationName: "Stojkovic OD",
          owner: session.user,
          role: membership.role,
          caseNumberFormat: "YYYY-N",
          caseNumberFormatOptions: CASE_NUMBER_FORMATS,
        }
      : null;
  });
  readonly loading = signal(true);

  bootstrap(): Observable<AuthSessionResponse | null> {
    return this.api.me().pipe(
      tap((session) => {
        this.session.set(session);
      }),
      catchError(() => of(null)),
      finalize(() => this.loading.set(false)),
    );
  }

  login(email: string, password: string) {
    return this.api.login({ email, password }).pipe(
      tap((session) => {
        this.session.set(session);
      }),
    );
  }

  logout() {
    return this.api.logout().pipe(
      tap(() => {
        this.session.set(null);
        void this.router.navigate(["/login"]);
      }),
    );
  }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthState);

  const modifiedRequest = request.clone({ withCredentials: true });

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
