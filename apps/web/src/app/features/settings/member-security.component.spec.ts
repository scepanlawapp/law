import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { EMPTY, Observable, of, throwError } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import {
  AuthSessionResponse,
  MemberSecuritySummary,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { provideRouter } from "@angular/router";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { By } from "@angular/platform-browser";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { MemberSecurityComponent } from "./member-security.component";
import {
  PasswordConfirmDialogService,
  PasswordConfirmOptions,
} from "./password-confirm-dialog.service";

const MEMBERS: MemberSecuritySummary[] = [
  {
    userId: "u-me",
    name: "Ja Admin",
    email: "me@example.com",
    role: WorkspaceRole.ADMIN,
    mfaEnabled: true,
    mfaEnabledAt: "2026-10-01T10:00:00.000Z",
  },
  {
    userId: "u-ana",
    name: "Ana Ilić",
    email: "ana@example.com",
    role: WorkspaceRole.LAWYER,
    mfaEnabled: true,
    mfaEnabledAt: "2026-10-02T10:00:00.000Z",
  },
  {
    userId: "u-marko",
    name: null,
    email: "marko@example.com",
    role: WorkspaceRole.MEMBER,
    mfaEnabled: false,
    mfaEnabledAt: null,
  },
  {
    userId: "u-owner",
    name: "Vlasnik",
    email: "owner@example.com",
    role: WorkspaceRole.OWNER,
    mfaEnabled: true,
    mfaEnabledAt: "2026-10-03T10:00:00.000Z",
  },
];

function session(role: WorkspaceRole): AuthSessionResponse {
  return {
    user: { id: "u-me", email: "me@example.com", status: "ACTIVE" },
    memberships: [{ workspaceId: "w1", workspaceName: "Kancelarija", role }],
  };
}

describe("MemberSecurityComponent", () => {
  const api = {
    getMfaPolicy: jest.fn(),
    setMfaPolicy: jest.fn(),
    memberSecurity: jest.fn(),
    resetMemberMfa: jest.fn(),
  };
  const toast = { success: jest.fn(), error: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };
  const passwordDialog = { open: jest.fn() };
  /** The admin types the password and the dialog runs the action. */
  const typePassword = () =>
    passwordDialog.open.mockImplementation(
      (options: PasswordConfirmOptions<unknown>): Observable<unknown> =>
        options.run("admin-pass"),
    );

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
    api.getMfaPolicy.mockReturnValue(of({ mfaRequired: false }));
    api.memberSecurity.mockReturnValue(of(MEMBERS));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiClient, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: PasswordConfirmDialogService, useValue: passwordDialog },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string) => key,
            language: () => "SR",
            locale: () => "sr-Latn-RS",
          },
        },
      ],
    });
  });

  function render(role: WorkspaceRole) {
    TestBed.inject(AuthState).session.set(session(role));
    const fixture = TestBed.createComponent(MemberSecurityComponent);
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: { nativeElement: HTMLElement }, testId: string) {
    return fixture.nativeElement.querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
  }

  function toggleSwitch(
    fixture: ReturnType<typeof render>,
    checked: boolean,
  ): void {
    fixture.debugElement
      .query(By.directive(HlmSwitch))
      .componentInstance.checkedChange.emit(checked);
    fixture.detectChanges();
  }

  it("admin section hidden for MEMBER", () => {
    const fixture = render(WorkspaceRole.MEMBER);

    expect(el(fixture, "policy-switch")).toBeNull();
    expect(el(fixture, "members-table")).toBeNull();
    expect(api.getMfaPolicy).not.toHaveBeenCalled();
    expect(api.memberSecurity).not.toHaveBeenCalled();
  });

  it("admin section hidden for LAWYER", () => {
    const fixture = render(WorkspaceRole.LAWYER);
    expect(el(fixture, "members-table")).toBeNull();
    expect(api.memberSecurity).not.toHaveBeenCalled();
  });

  it("shows the policy and the members for ADMIN", () => {
    api.getMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    const fixture = render(WorkspaceRole.ADMIN);

    expect(el(fixture, "policy-switch")).not.toBeNull();
    expect(
      fixture.debugElement
        .query(By.directive(HlmSwitch))
        .componentInstance.checked(),
    ).toBe(true);
    expect(el(fixture, "member-row-u-ana")?.textContent).toContain("Ana Ilić");
    expect(el(fixture, "member-row-u-marko")?.textContent).toContain(
      "marko@example.com",
    );
  });

  it("toggling policy off asks for the password then calls setMfaPolicy with it", () => {
    api.getMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    api.setMfaPolicy.mockReturnValue(of({ mfaRequired: false }));
    typePassword();
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, false);

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(passwordDialog.open).toHaveBeenCalledTimes(1);
    expect(passwordDialog.open.mock.calls[0][0]).toMatchObject({
      title: "security.policyOffTitle",
      description: "security.policyOffMessage",
      confirmText: "security.policyOffConfirm",
    });
    expect(api.setMfaPolicy).toHaveBeenCalledWith({
      mfaRequired: false,
      currentPassword: "admin-pass",
    });
    expect(fixture.componentInstance.policyControl.value).toBe(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps the policy on when the password dialog for switching off is cancelled", () => {
    api.getMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    passwordDialog.open.mockReturnValue(EMPTY);
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, false);

    expect(api.setMfaPolicy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.policyControl.value).toBe(true);
    expect(fixture.componentInstance.savingPolicy()).toBe(false);
  });

  it("toggling policy on shows the confirmation text in the password dialog, then calls setMfaPolicy with the password", () => {
    api.setMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    typePassword();
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(passwordDialog.open).toHaveBeenCalledTimes(1);
    expect(passwordDialog.open.mock.calls[0][0]).toMatchObject({
      title: "security.policyConfirmTitle",
      description: "security.policyConfirmMessage",
      confirmText: "security.policyConfirm",
    });
    expect(api.setMfaPolicy).toHaveBeenCalledWith({
      mfaRequired: true,
      currentPassword: "admin-pass",
    });
    expect(fixture.componentInstance.policyControl.value).toBe(true);
  });

  it("keeps the policy off when the password dialog is cancelled", () => {
    passwordDialog.open.mockReturnValue(EMPTY);
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(api.setMfaPolicy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.policyControl.value).toBe(false);
    expect(fixture.componentInstance.savingPolicy()).toBe(false);
  });

  it("leaves a failed policy save to the dialog (wrong password stays inline)", () => {
    const failure = new HttpErrorResponse({ status: 401 });
    let runError: unknown;
    passwordDialog.open.mockImplementation(
      (options: PasswordConfirmOptions<unknown>) => {
        // The dialog subscribes to `run` and keeps errors inline.
        options.run("wrong").subscribe({ error: (e) => (runError = e) });
        return EMPTY;
      },
    );
    api.setMfaPolicy.mockReturnValue(throwError(() => failure));
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(runError).toBe(failure);
    expect(fixture.componentInstance.policyControl.value).toBe(false);
  });

  it("reset asks for the password (destructive) then calls resetMemberMfa with it and refreshes the list", () => {
    api.resetMemberMfa.mockReturnValue(of(undefined));
    typePassword();
    const fixture = render(WorkspaceRole.ADMIN);

    el(fixture, "reset-mfa-u-ana")?.click();

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(passwordDialog.open).toHaveBeenCalledTimes(1);
    expect(passwordDialog.open.mock.calls[0][0]).toMatchObject({
      title: "security.resetConfirmTitle",
      description: "security.resetConfirmMessage",
      confirmText: "security.reset",
      destructive: true,
    });
    expect(api.resetMemberMfa).toHaveBeenCalledWith("u-ana", "admin-pass");
    expect(api.memberSecurity).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not reset when the password dialog is cancelled", () => {
    passwordDialog.open.mockReturnValue(EMPTY);
    const fixture = render(WorkspaceRole.ADMIN);

    el(fixture, "reset-mfa-u-ana")?.click();

    expect(api.resetMemberMfa).not.toHaveBeenCalled();
    expect(api.memberSecurity).toHaveBeenCalledTimes(1);
  });

  it("own row has no reset button", () => {
    const fixture = render(WorkspaceRole.ADMIN);

    expect(el(fixture, "member-row-u-me")).not.toBeNull();
    expect(el(fixture, "reset-mfa-u-me")).toBeNull();
    expect(el(fixture, "reset-mfa-u-ana")).not.toBeNull();
  });

  it("has no reset button for members without 2FA", () => {
    const fixture = render(WorkspaceRole.ADMIN);
    expect(el(fixture, "reset-mfa-u-marko")).toBeNull();
  });

  it("hides the reset button on OWNER rows for an ADMIN but not for an OWNER", () => {
    const admin = render(WorkspaceRole.ADMIN);
    expect(el(admin, "reset-mfa-u-owner")).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiClient, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: PasswordConfirmDialogService, useValue: passwordDialog },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string) => key,
            language: () => "SR",
            locale: () => "sr-Latn-RS",
          },
        },
      ],
    });
    const owner = render(WorkspaceRole.OWNER);
    expect(el(owner, "reset-mfa-u-owner")).not.toBeNull();
  });
});
