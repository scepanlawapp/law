import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { AuthSessionResponse } from "@law/api-interfaces";
import { AuthState } from "./security";

const session: AuthSessionResponse = {
  user: { id: "user-1", email: "lawyer@example.test", status: "ACTIVE" },
  memberships: [],
};

describe("AuthState", () => {
  const api = { me: jest.fn(), login: jest.fn(), logout: jest.fn() };
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
});
