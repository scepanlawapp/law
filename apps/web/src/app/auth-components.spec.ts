import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import { AcceptInvitationComponent } from "./accept-invitation.component";
import { ForgotPasswordComponent } from "./forgot-password.component";
import { LoginComponent } from "./login.component";
import { ResetPasswordComponent } from "./reset-password.component";

const routeWithToken = (token: string) => ({
  snapshot: { queryParamMap: { get: () => token } },
});

describe("authentication components", () => {
  const api = {
    acceptInvitation: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };
  const auth = { login: jest.fn() };
  const router = { navigate: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("submits login credentials and navigates on success", () => {
    auth.login.mockReturnValue(of({}));
    const fixture = createFixture(LoginComponent, [
      { provide: AuthState, useValue: auth },
      { provide: Router, useValue: router },
    ]);
    const component = fixture.componentInstance;
    component.email = "lawyer@example.test";
    component.password = "a-long-password";

    component.submit();

    expect(auth.login).toHaveBeenCalledWith("lawyer@example.test", "a-long-password");
    expect(router.navigate).toHaveBeenCalledWith(["/"]);
  });

  it("shows a generic login error", () => {
    auth.login.mockReturnValue(throwError(() => new Error("invalid")));
    const fixture = createFixture(LoginComponent, [
      { provide: AuthState, useValue: auth },
      { provide: Router, useValue: router },
    ]);

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toContain("Unable to sign in");
  });

  it("submits forgot-password requests with a generic success state", () => {
    api.forgotPassword.mockReturnValue(of({ success: true }));
    const fixture = createFixture(ForgotPasswordComponent, [
      { provide: AuthApiClient, useValue: api },
    ]);
    fixture.componentInstance.email = "lawyer@example.test";

    fixture.componentInstance.submit();

    expect(api.forgotPassword).toHaveBeenCalledWith({ email: "lawyer@example.test" });
    expect(fixture.componentInstance.sent()).toBe(true);
  });

  it("passes the invitation token from the URL", () => {
    api.acceptInvitation.mockReturnValue(throwError(() => new Error("expired")));
    const invitation = createFixture(AcceptInvitationComponent, [
      { provide: AuthApiClient, useValue: api },
      { provide: ActivatedRoute, useValue: routeWithToken("invite-token") },
      { provide: Router, useValue: router },
    ]);

    invitation.componentInstance.submit();

    expect(api.acceptInvitation).toHaveBeenCalledWith({ token: "invite-token", password: "" });
    expect(invitation.componentInstance.error()).toContain("invalid or expired");
  });

  it("passes the reset token from the URL", () => {
    api.resetPassword.mockReturnValue(throwError(() => new Error("expired")));
    const reset = createFixture(ResetPasswordComponent, [
      { provide: AuthApiClient, useValue: api },
      { provide: ActivatedRoute, useValue: routeWithToken("reset-token") },
      { provide: Router, useValue: router },
    ]);

    reset.componentInstance.submit();

    expect(api.resetPassword).toHaveBeenCalledWith({ token: "reset-token", password: "" });
    expect(reset.componentInstance.error()).toContain("invalid or expired");
  });
});

function createFixture<T>(component: new (...args: never[]) => T, providers: object[]): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeWithToken("") },
      ...providers,
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}