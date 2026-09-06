import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import {
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from "@angular/common/http";
import { firstValueFrom, of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { AuthSessionResponse } from "@law/api-interfaces";
import { AuthState, authInterceptor } from "./security";

const session: AuthSessionResponse = {
  user: { id: "user-1", email: "lawyer@example.test", status: "ACTIVE" },
  memberships: [],
};

describe("AuthState", () => {
  const api = {
    me: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
  };
  const router = { navigate: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AuthState,
        { provide: AuthApiClient, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
  });

  it("restores an authenticated session during bootstrap", () => {
    api.me.mockReturnValue(of(session));
    const state = TestBed.inject(AuthState);

    state.bootstrap().subscribe();

    expect(state.session()).toEqual(session);
    expect(state.loading()).toBe(false);
  });

  it("stores the session returned by login", () => {
    api.login.mockReturnValue(of(session));
    const state = TestBed.inject(AuthState);

    state.login(session.user.email, "password").subscribe();

    expect(api.login).toHaveBeenCalledWith({
      email: session.user.email,
      password: "password",
    });
    expect(state.session()).toEqual(session);
  });

  it("clears the session and navigates after logout", () => {
    api.logout.mockReturnValue(of({ success: true }));
    const state = TestBed.inject(AuthState);
    state.session.set(session);

    state.logout().subscribe();

    expect(state.session()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(["/login"]);
  });

  it("refreshes once and retries a protected request after a 401", async () => {
    const refreshed = {
      ...session,
      user: { ...session.user, email: "refreshed@example.test" },
    };
    api.refresh = jest.fn().mockReturnValue(of(refreshed));
    const request = new HttpRequest("GET", "http://localhost:3000/api/workspace");
    const next = jest
      .fn()
      .mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 401 })),
      )
      .mockReturnValueOnce(of(new HttpResponse({ status: 200 })));

    await TestBed.runInInjectionContext(() =>
      firstValueFrom(authInterceptor(request, next)),
    );

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[1][0].withCredentials).toBe(true);
    expect(TestBed.inject(AuthState).session()).toEqual(refreshed);
  });

  it("does not refresh an authentication endpoint after a 401", async () => {
    api.refresh = jest.fn();
    const request = new HttpRequest("POST", "http://localhost:3000/api/auth/login", {});
    const next = jest.fn().mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );

    await expect(
      TestBed.runInInjectionContext(() =>
        firstValueFrom(authInterceptor(request, next)),
      ),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(api.refresh).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
