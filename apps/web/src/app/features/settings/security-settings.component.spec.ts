import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { Observable, of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import {
  AuthSessionResponse,
  MfaStatusResponse,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { PasswordConfirmDialogService } from "./password-confirm-dialog.service";
import { RecoveryCodesDialogService } from "./recovery-codes-dialog.service";
import { SecuritySettingsComponent } from "./security-settings.component";

const DEVICE = {
  id: "dev-1",
  userAgent: "Firefox on Linux",
  createdAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: "2026-10-10T10:00:00.000Z",
  expiresAt: "2026-10-31T10:00:00.000Z",
  current: true,
};

function status(overrides: Partial<MfaStatusResponse> = {}): MfaStatusResponse {
  return {
    enabled: false,
    enabledAt: null,
    recoveryCodesRemaining: 0,
    policyRequired: false,
    trustedDevices: [],
    ...overrides,
  };
}

function session(role: WorkspaceRole): AuthSessionResponse {
  return {
    user: { id: "u-me", email: "me@example.com", status: "ACTIVE" },
    memberships: [{ workspaceId: "w1", workspaceName: "Kancelarija", role }],
  };
}

describe("SecuritySettingsComponent", () => {
  const api = {
    mfaStatus: jest.fn(),
    disableMfa: jest.fn(),
    regenerateRecoveryCodes: jest.fn(),
    revokeTrustedDevice: jest.fn(),
    revokeTrustedDevices: jest.fn(),
    changePassword: jest.fn(),
    getMfaPolicy: jest.fn(),
    memberSecurity: jest.fn(),
  };
  const toast = { success: jest.fn(), error: jest.fn() };
  const passwordDialog = { open: jest.fn() };
  const recoveryDialog = { open: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };

  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // no layout in jsdom
      }
      unobserve(): void {
        // no layout in jsdom
      }
      disconnect(): void {
        // no layout in jsdom
      }
    };
  });

  beforeEach(() => {
    jest.resetAllMocks();
    api.mfaStatus.mockReturnValue(of(status()));
    // The dialog runs the action with a typed password, as the real one does.
    passwordDialog.open.mockImplementation(
      (options: { run: (password: string) => Observable<unknown> }) =>
        options.run("pw-123456789012"),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiClient, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: PasswordConfirmDialogService, useValue: passwordDialog },
        { provide: RecoveryCodesDialogService, useValue: recoveryDialog },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string, params?: Record<string, unknown>) =>
              params ? `${key} ${JSON.stringify(params)}` : key,
            language: () => "SR",
            locale: () => "sr-Latn-RS",
          },
        },
      ],
    });
    TestBed.inject(AuthState).session.set(session(WorkspaceRole.MEMBER));
  });

  function render() {
    const fixture = TestBed.createComponent(SecuritySettingsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: { nativeElement: HTMLElement }, testId: string) {
    return fixture.nativeElement.querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
  }

  it("shows enable button when disabled and status when enabled", () => {
    const disabled = render();
    expect(el(disabled, "enable-mfa")).not.toBeNull();
    expect(el(disabled, "mfa-status")).toBeNull();
    expect(el(disabled, "disable-mfa")).toBeNull();

    api.mfaStatus.mockReturnValue(
      of(
        status({
          enabled: true,
          enabledAt: "2026-10-05T08:00:00.000Z",
          recoveryCodesRemaining: 7,
        }),
      ),
    );
    const enabled = render();
    expect(el(enabled, "enable-mfa")).toBeNull();
    expect(el(enabled, "mfa-status")?.textContent).toContain("7");
    expect(el(enabled, "disable-mfa")).not.toBeNull();
    expect(el(enabled, "regenerate-codes")).not.toBeNull();
  });

  it("opens the enrollment component and refreshes status when it completes", () => {
    const fixture = render();
    el(fixture, "enable-mfa")?.click();
    fixture.detectChanges();
    const enrollment =
      fixture.nativeElement.querySelector("law-mfa-enrollment");
    expect(enrollment).not.toBeNull();

    api.mfaStatus.mockReturnValue(of(status({ enabled: true })));
    fixture.componentInstance.onEnrollmentCompleted({});
    fixture.detectChanges();

    expect(api.mfaStatus).toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.querySelector("law-mfa-enrollment"),
    ).toBeNull();
    expect(el(fixture, "mfa-status")).not.toBeNull();
  });

  it("disable button hidden with notice when policyRequired", () => {
    api.mfaStatus.mockReturnValue(
      of(status({ enabled: true, policyRequired: true })),
    );
    const fixture = render();

    expect(el(fixture, "disable-mfa")).toBeNull();
    expect(el(fixture, "mfa-policy-notice")).not.toBeNull();
  });

  it("disables 2FA after the password dialog and refreshes status", () => {
    api.mfaStatus.mockReturnValue(of(status({ enabled: true })));
    api.disableMfa.mockReturnValue(of({ success: true }));
    const fixture = render();

    api.mfaStatus.mockReturnValue(of(status()));
    el(fixture, "disable-mfa")?.click();
    fixture.detectChanges();

    expect(passwordDialog.open).toHaveBeenCalledTimes(1);
    expect(api.disableMfa).toHaveBeenCalledWith("pw-123456789012");
    expect(el(fixture, "enable-mfa")).not.toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows regenerated recovery codes once in the codes dialog", () => {
    api.mfaStatus.mockReturnValue(of(status({ enabled: true })));
    api.regenerateRecoveryCodes.mockReturnValue(
      of({ recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] }),
    );
    const fixture = render();

    el(fixture, "regenerate-codes")?.click();

    expect(api.regenerateRecoveryCodes).toHaveBeenCalledWith("pw-123456789012");
    expect(recoveryDialog.open).toHaveBeenCalledWith([
      "aaaa-bbbb",
      "cccc-dddd",
    ]);
  });

  it("lists trusted devices and revokes one after asking for the password", () => {
    api.mfaStatus.mockReturnValue(
      of(status({ enabled: true, trustedDevices: [DEVICE] })),
    );
    api.revokeTrustedDevice.mockReturnValue(of({ success: true }));
    const fixture = render();

    expect(el(fixture, "device-dev-1")?.textContent).toContain(
      "Firefox on Linux",
    );
    expect(el(fixture, "device-dev-1")?.textContent).toContain(
      "security.thisDevice",
    );
    el(fixture, "revoke-device-dev-1")?.click();

    expect(api.revokeTrustedDevice).toHaveBeenCalledWith(
      "dev-1",
      "pw-123456789012",
    );
    expect(api.mfaStatus).toHaveBeenCalledTimes(2);
  });

  it("revoke-all asks for password then calls API", () => {
    api.mfaStatus.mockReturnValue(
      of(status({ enabled: true, trustedDevices: [DEVICE] })),
    );
    api.revokeTrustedDevices.mockReturnValue(of({ success: true }));
    const fixture = render();

    el(fixture, "revoke-all-devices")?.click();

    expect(passwordDialog.open).toHaveBeenCalledTimes(1);
    expect(api.revokeTrustedDevices).toHaveBeenCalledWith("pw-123456789012");
    expect(api.mfaStatus).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state without trusted devices", () => {
    api.mfaStatus.mockReturnValue(of(status({ enabled: true })));
    const fixture = render();

    expect(el(fixture, "no-devices")).not.toBeNull();
    expect(el(fixture, "revoke-all-devices")).toBeNull();
  });

  it("change password form still submits", () => {
    api.changePassword.mockReturnValue(of({ success: true }));
    const fixture = render();
    const component = fixture.componentInstance;

    component.passwordForm.setValue({
      currentPassword: "old-password-1",
      newPassword: "new-password-12345",
    });
    fixture.nativeElement
      .querySelector("form[data-testid='password-form']")
      .dispatchEvent(new Event("submit"));

    expect(api.changePassword).toHaveBeenCalledWith(
      "old-password-1",
      "new-password-12345",
    );
    expect(toast.success).toHaveBeenCalledWith("settings.passwordChanged");
    expect(component.passwordForm.getRawValue().currentPassword).toBe("");
  });

  it("does not submit an invalid change password form", () => {
    const fixture = render();
    fixture.componentInstance.changePassword();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("toasts a password change failure", () => {
    api.changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const fixture = render();
    fixture.componentInstance.passwordForm.setValue({
      currentPassword: "old-password-1",
      newPassword: "new-password-12345",
    });
    fixture.componentInstance.changePassword();

    expect(toast.error).toHaveBeenCalledWith("settings.passwordChangeError");
  });

  it("explains a failed status load", () => {
    api.mfaStatus.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const fixture = render();
    expect(el(fixture, "status-error")).not.toBeNull();
  });
});
