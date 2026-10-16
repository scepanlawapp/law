import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { LoginComponent } from "./login.component";

describe("LoginComponent", () => {
  const auth = { login: jest.fn(), completeLogin: jest.fn() };
  const api = { verifyMfa: jest.fn(), sendMfaEmailCode: jest.fn() };
  const router = { navigate: jest.fn() };
  const localization = { translate: jest.fn((key: string) => key) };
  const toast = { error: jest.fn() };
  const session = { user: {}, memberships: [] };

  function create(): LoginComponent {
    jest.resetAllMocks();
    localization.translate.mockImplementation((key: string) => key);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthState, useValue: auth },
        { provide: AuthApiClient, useValue: api },
        { provide: Router, useValue: router },
        { provide: LocalizationService, useValue: localization },
        { provide: ToastService, useValue: toast },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new LoginComponent());
    component.loginForm.setValue({
      email: "ana@example.com",
      password: "password",
    });
    return component;
  }

  function createOnCodeStep(
    methods: ("TOTP" | "RECOVERY" | "EMAIL")[] = ["TOTP", "RECOVERY", "EMAIL"],
  ): LoginComponent {
    const component = create();
    auth.login.mockReturnValue(of({ status: "MFA_REQUIRED", methods }));
    component.login();
    return component;
  }

  function unauthorized(code: string | undefined): HttpErrorResponse {
    return new HttpErrorResponse({
      status: 401,
      error: code ? { statusCode: 401, error: code } : undefined,
    });
  }

  it("navigates home after an AUTHENTICATED login", () => {
    const component = create();
    auth.login.mockReturnValue(of({ status: "AUTHENTICATED", session }));

    component.login();

    expect(router.navigate).toHaveBeenCalledWith(["/"]);
    expect(component.submitting()).toBe(false);
    expect(component.step()).toBe("password");
  });

  it("MFA_REQUIRED switches to the code step", () => {
    const component = createOnCodeStep();

    expect(component.step()).toBe("code");
    expect(component.method()).toBe("TOTP");
    expect(component.methods()).toEqual(["TOTP", "RECOVERY", "EMAIL"]);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it("MFA_ENROLLMENT_REQUIRED navigates to /mfa-setup", () => {
    const component = create();
    auth.login.mockReturnValue(of({ status: "MFA_ENROLLMENT_REQUIRED" }));

    component.login();

    expect(router.navigate).toHaveBeenCalledWith(["/mfa-setup"]);
    expect(component.step()).toBe("password");
    expect(component.submitting()).toBe(false);
  });

  it("submits TOTP with rememberDevice and completes the login", () => {
    const component = createOnCodeStep();
    api.verifyMfa.mockReturnValue(of(session));
    component.codeForm.setValue({ code: "123 456", rememberDevice: true });

    component.verify();

    expect(api.verifyMfa).toHaveBeenCalledWith({
      method: "TOTP",
      code: "123456",
      rememberDevice: true,
    });
    expect(auth.completeLogin).toHaveBeenCalledWith(session);
    expect(router.navigate).toHaveBeenCalledWith(["/"]);
  });

  it("does not submit a TOTP code that is not exactly 6 digits", () => {
    const component = createOnCodeStep();
    component.codeForm.patchValue({ code: "12345" });

    expect(component.codeValid()).toBe(false);
    component.verify();

    expect(api.verifyMfa).not.toHaveBeenCalled();
    component.codeForm.patchValue({ code: "123456" });
    expect(component.codeValid()).toBe(true);
  });

  it('"Koristi rezervni kod" switches method to RECOVERY and input accepts xxxx-xxxx', () => {
    const component = createOnCodeStep();
    component.codeForm.patchValue({ code: "123456" });

    component.useRecovery();

    expect(component.method()).toBe("RECOVERY");
    expect(component.codeForm.controls.code.value).toBe("");
    expect(component.codeMaxLength()).toBe(9);
    component.codeForm.patchValue({ code: "abcd-ef23" });
    expect(component.codeValid()).toBe(true);
    component.codeForm.patchValue({ code: "abcdef23" });
    expect(component.codeValid()).toBe(true);
    component.codeForm.patchValue({ code: "abc-ef23" });
    expect(component.codeValid()).toBe(false);

    api.verifyMfa.mockReturnValue(of(session));
    component.codeForm.patchValue({ code: "abcd-ef23" });
    component.verify();
    expect(api.verifyMfa).toHaveBeenCalledWith({
      method: "RECOVERY",
      code: "abcd-ef23",
      rememberDevice: false,
    });
  });

  it('"Pošalji kod na e-mail" calls sendMfaEmailCode then method EMAIL', () => {
    const component = createOnCodeStep();
    api.sendMfaEmailCode.mockReturnValue(of(undefined));

    component.sendEmailCode();

    expect(api.sendMfaEmailCode).toHaveBeenCalledTimes(1);
    expect(component.method()).toBe("EMAIL");
    expect(component.emailCodeSent()).toBe(true);
    expect(component.codeMaxLength()).toBe(6);
  });

  it("a failed e-mail code request with a dead challenge returns to the password step", () => {
    const component = createOnCodeStep();
    api.sendMfaEmailCode.mockReturnValue(
      throwError(() => unauthorized("MFA_CHALLENGE_INVALID")),
    );

    component.sendEmailCode();

    expect(component.step()).toBe("password");
    expect(component.notice()).toBe("auth.mfa.challengeExpired");
  });

  it("401 MFA_CODE_INVALID shows the invalid-code error and stays on the code step", () => {
    const component = createOnCodeStep();
    api.verifyMfa.mockReturnValue(
      throwError(() => unauthorized("MFA_CODE_INVALID")),
    );
    component.codeForm.patchValue({ code: "123456" });

    component.verify();

    expect(component.step()).toBe("code");
    expect(component.error()).toBe("auth.mfa.codeInvalid");
    expect(component.submitting()).toBe(false);
    expect(component.codeForm.controls.code.value).toBe("");
  });

  it.each([["MFA_CHALLENGE_INVALID"], [undefined]])(
    "401 with locked/expired challenge (%s) returns to the password step with a notice",
    (code) => {
      const component = createOnCodeStep();
      api.verifyMfa.mockReturnValue(throwError(() => unauthorized(code)));
      component.codeForm.patchValue({ code: "123456" });

      component.verify();

      expect(component.step()).toBe("password");
      expect(component.notice()).toBe("auth.mfa.challengeExpired");
      expect(component.error()).toBe("");
      expect(component.loginForm.controls.password.value).toBe("");
      expect(auth.completeLogin).not.toHaveBeenCalled();
    },
  );

  it("shows a generic error for a non-401 verify failure", () => {
    const component = createOnCodeStep();
    api.verifyMfa.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    component.codeForm.patchValue({ code: "123456" });

    component.verify();

    expect(component.step()).toBe("code");
    expect(component.error()).toBe("auth.loginFailed");
  });

  it("hides recovery/e-mail switches the server did not offer", () => {
    const component = createOnCodeStep(["TOTP"]);

    expect(component.canUse("RECOVERY")).toBe(false);
    expect(component.canUse("EMAIL")).toBe(false);
    expect(component.canUse("TOTP")).toBe(true);
  });
});
