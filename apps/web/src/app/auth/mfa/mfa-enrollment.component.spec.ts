import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { MfaEnrollmentComponent } from "./mfa-enrollment.component";

const CODES = Array.from({ length: 10 }, (_, i) => `abcd-ef${20 + i}`);
const start = {
  otpauthUrl: "otpauth://totp/x",
  qrCodeDataUrl: "data:image/png;base64,AAAA",
  secret: "JBSWY3DPEHPK3PXP",
};

describe("MfaEnrollmentComponent", () => {
  const api = {
    startMfaEnrollment: jest.fn(),
    confirmMfaEnrollment: jest.fn(),
  };
  const localization = { translate: jest.fn((key: string) => key) };

  beforeEach(() => {
    jest.resetAllMocks();
    localization.translate.mockImplementation((key: string) => key);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiClient, useValue: api },
        { provide: LocalizationService, useValue: localization },
      ],
    });
  });

  function render(mode: "challenge" | "session") {
    const fixture = TestBed.createComponent(MfaEnrollmentComponent);
    fixture.componentRef.setInput("mode", mode);
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, completed };
  }

  function renderConfirmed(response: object = { recoveryCodes: CODES }) {
    api.startMfaEnrollment.mockReturnValue(of(start));
    api.confirmMfaEnrollment.mockReturnValue(of(response));
    const rendered = render("challenge");
    rendered.component.codeForm.setValue({ code: "123456" });
    rendered.component.confirm();
    rendered.fixture.detectChanges();
    return rendered;
  }

  it("challenge mode skips the password step and starts enrollment", () => {
    api.startMfaEnrollment.mockReturnValue(of(start));
    const { component, fixture } = render("challenge");

    expect(api.startMfaEnrollment).toHaveBeenCalledWith(undefined);
    expect(component.step()).toBe("scan");
    expect(component.start()?.secret).toBe(start.secret);
    const image = fixture.nativeElement.querySelector("img");
    expect(image.getAttribute("src")).toBe(start.qrCodeDataUrl);
  });

  it("challenge mode without a challenge shows the unavailable message", () => {
    api.startMfaEnrollment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const { component, fixture } = render("challenge");

    expect(component.step()).toBe("unavailable");
    const link = fixture.nativeElement.querySelector("a[href='/login']");
    expect(link).not.toBeNull();
  });

  it("session mode starts with the password step and sends the password", () => {
    const { component } = render("session");
    expect(component.step()).toBe("password");
    expect(api.startMfaEnrollment).not.toHaveBeenCalled();

    api.startMfaEnrollment.mockReturnValue(of(start));
    component.passwordForm.setValue({ currentPassword: "secret-pass" });
    component.submitPassword();

    expect(api.startMfaEnrollment).toHaveBeenCalledWith("secret-pass");
    expect(component.step()).toBe("scan");
  });

  it("session mode reports a wrong password and stays on the password step", () => {
    const { component } = render("session");
    api.startMfaEnrollment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    component.passwordForm.setValue({ currentPassword: "wrong" });

    component.submitPassword();

    expect(component.step()).toBe("password");
    expect(component.error()).toBe("auth.mfa.passwordInvalid");
  });

  it("groups the secret in 4-char blocks", () => {
    api.startMfaEnrollment.mockReturnValue(of(start));
    const { component } = render("challenge");

    expect(component.groupedSecret()).toBe("JBSW Y3DP EHPK 3PXP");
  });

  it("confirms with exactly 6 digits and shows the recovery codes", () => {
    api.startMfaEnrollment.mockReturnValue(of(start));
    const { component } = render("challenge");
    api.confirmMfaEnrollment.mockReturnValue(of({ recoveryCodes: CODES }));

    component.codeForm.setValue({ code: "12345" });
    component.confirm();
    expect(api.confirmMfaEnrollment).not.toHaveBeenCalled();

    component.codeForm.setValue({ code: "123 456" });
    component.confirm();
    expect(api.confirmMfaEnrollment).toHaveBeenCalledWith("123456");
    expect(component.step()).toBe("codes");
    expect(component.recoveryCodes()).toEqual(CODES);
  });

  function confirmFails(
    mode: "challenge" | "session",
    error: HttpErrorResponse,
  ) {
    if (mode === "challenge") api.startMfaEnrollment.mockReturnValue(of(start));
    const rendered = render(mode);
    if (mode === "session") {
      api.startMfaEnrollment.mockReturnValue(of(start));
      rendered.component.passwordForm.setValue({ currentPassword: "pw" });
      rendered.component.submitPassword();
    }
    api.confirmMfaEnrollment.mockReturnValue(throwError(() => error));
    rendered.component.codeForm.setValue({ code: "123456" });
    rendered.component.confirm();
    return rendered.component;
  }

  const unauthorized = (code?: string) =>
    new HttpErrorResponse({
      status: 401,
      error: code ? { statusCode: 401, error: code } : undefined,
    });

  it("a wrong confirmation code (MFA_CODE_INVALID) stays on the scan step with an error", () => {
    const component = confirmFails(
      "challenge",
      unauthorized("MFA_CODE_INVALID"),
    );

    expect(component.step()).toBe("scan");
    expect(component.error()).toBe("auth.mfa.codeInvalid");
  });

  it.each([["MFA_CHALLENGE_INVALID"], [undefined]])(
    "a dead enrollment challenge (%s) in challenge mode shows the unavailable step",
    (code) => {
      const component = confirmFails("challenge", unauthorized(code));

      expect(component.step()).toBe("unavailable");
    },
  );

  it("a non-code 401 in session mode shows the generic error and stays", () => {
    const component = confirmFails(
      "session",
      unauthorized("MFA_CHALLENGE_INVALID"),
    );

    expect(component.step()).toBe("scan");
    expect(component.error()).toBe("auth.mfa.setupFailed");
  });

  it("continue is disabled until the codes-saved checkbox is ticked", () => {
    const session = { user: {}, memberships: [] };
    const { component, completed, fixture } = renderConfirmed({
      recoveryCodes: CODES,
      session,
    });
    const button = (): HTMLButtonElement =>
      fixture.nativeElement.querySelector("button[data-testid='mfa-continue']");
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      "input[type='checkbox']",
    );

    expect(component.canContinue()).toBe(false);
    expect(button().disabled).toBe(true);
    component.finish();
    expect(completed).not.toHaveBeenCalled();

    checkbox.click();
    fixture.detectChanges();
    expect(component.canContinue()).toBe(true);
    expect(button().disabled).toBe(false);
    button().click();
    expect(completed).toHaveBeenCalledWith({ session });
  });

  it("download produces the 10 codes, one per line, with a header and date", () => {
    const { component } = renderConfirmed();

    const text = component.recoveryCodesText(new Date("2026-10-16T10:00:00Z"));
    const lines = text.split("\n");

    expect(lines[0]).toBe("auth.mfa.downloadHeader");
    expect(lines[1]).toContain("2026-10-16");
    expect(lines.filter((line) => CODES.includes(line))).toEqual(CODES);
    expect(component.downloadFileName).toBe("law-recovery-codes.txt");
  });
});
