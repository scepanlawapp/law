import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
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
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
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

  it("toggling policy off calls setMfaPolicy immediately", () => {
    api.getMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    api.setMfaPolicy.mockReturnValue(of({ mfaRequired: false }));
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, false);

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(api.setMfaPolicy).toHaveBeenCalledWith({ mfaRequired: false });
    expect(toast.success).toHaveBeenCalled();
  });

  it("toggling policy on asks for confirmation then calls setMfaPolicy", () => {
    confirmDialog.confirm.mockReturnValue(of(true));
    api.setMfaPolicy.mockReturnValue(of({ mfaRequired: true }));
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(api.setMfaPolicy).toHaveBeenCalledWith({ mfaRequired: true });
  });

  it("keeps the policy off when the confirmation is cancelled", () => {
    confirmDialog.confirm.mockReturnValue(of(false));
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(api.setMfaPolicy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.policyControl.value).toBe(false);
  });

  it("reverts the switch when saving the policy fails", () => {
    confirmDialog.confirm.mockReturnValue(of(true));
    api.setMfaPolicy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const fixture = render(WorkspaceRole.OWNER);

    toggleSwitch(fixture, true);

    expect(toast.error).toHaveBeenCalled();
    expect(fixture.componentInstance.policyControl.value).toBe(false);
  });

  it("reset asks for confirmation then calls resetMemberMfa and refreshes the list", () => {
    confirmDialog.confirm.mockReturnValue(of(true));
    api.resetMemberMfa.mockReturnValue(of(undefined));
    const fixture = render(WorkspaceRole.ADMIN);

    el(fixture, "reset-mfa-u-ana")?.click();

    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(api.resetMemberMfa).toHaveBeenCalledWith("u-ana");
    expect(api.memberSecurity).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not reset when the confirmation is cancelled", () => {
    confirmDialog.confirm.mockReturnValue(of(false));
    const fixture = render(WorkspaceRole.ADMIN);

    el(fixture, "reset-mfa-u-ana")?.click();

    expect(api.resetMemberMfa).not.toHaveBeenCalled();
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
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
    const owner = render(WorkspaceRole.OWNER);
    expect(el(owner, "reset-mfa-u-owner")).not.toBeNull();
  });

  it("toasts a forbidden reset", () => {
    confirmDialog.confirm.mockReturnValue(of(true));
    api.resetMemberMfa.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    const fixture = render(WorkspaceRole.ADMIN);

    el(fixture, "reset-mfa-u-ana")?.click();

    expect(toast.error).toHaveBeenCalled();
    expect(api.memberSecurity).toHaveBeenCalledTimes(1);
  });
});
