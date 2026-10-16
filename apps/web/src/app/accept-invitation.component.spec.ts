import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { of } from "rxjs";
import { AuthApiClient } from "@law/api-clients";
import { LocalizationService } from "./core/localization/localization.service";
import { ToastService } from "./shared/ui/toast/toast.service";
import { AcceptInvitationComponent } from "./accept-invitation.component";

describe("AcceptInvitationComponent", () => {
  const api = { acceptInvitation: jest.fn() };
  const router = { navigate: jest.fn() };
  const toast = { error: jest.fn(), info: jest.fn() };

  function create(): AcceptInvitationComponent {
    jest.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApiClient, useValue: api },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ token: "raw" }) },
          },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
        { provide: ToastService, useValue: toast },
      ],
    });
    const component = TestBed.runInInjectionContext(
      () => new AcceptInvitationComponent(),
    );
    component.password = "CorrectHorse123!";
    return component;
  }

  afterEach(() => jest.useRealTimers());

  it("AUTHENTICATED → account ready, then back to login as before", () => {
    jest.useFakeTimers();
    const component = create();
    api.acceptInvitation.mockReturnValue(
      of({ status: "AUTHENTICATED", session: { user: {}, memberships: [] } }),
    );

    component.submit();

    expect(api.acceptInvitation).toHaveBeenCalledWith({
      token: "raw",
      password: "CorrectHorse123!",
    });
    expect(component.complete()).toBe(true);
    jest.advanceTimersByTime(800);
    expect(router.navigate).toHaveBeenCalledWith(["/login"]);
  });

  it("MFA_ENROLLMENT_REQUIRED → navigates to the 2FA setup screen", () => {
    jest.useFakeTimers();
    const component = create();
    api.acceptInvitation.mockReturnValue(
      of({ status: "MFA_ENROLLMENT_REQUIRED" }),
    );

    component.submit();
    jest.advanceTimersByTime(800);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(["/mfa-setup"]);
  });

  it("MFA_REQUIRED (account already has 2FA) → back to sign-in with a notice about the authenticator code", () => {
    jest.useFakeTimers();
    const component = create();
    api.acceptInvitation.mockReturnValue(
      of({ status: "MFA_REQUIRED", methods: ["TOTP", "RECOVERY"] }),
    );

    component.submit();
    jest.advanceTimersByTime(800);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(["/login"]);
    expect(toast.info).toHaveBeenCalledWith("auth.invitationSignInWithCode");
  });
});
