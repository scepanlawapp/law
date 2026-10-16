import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of } from "rxjs";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { LoginComponent } from "./login.component";

describe("LoginComponent", () => {
  const auth = { login: jest.fn() };
  const router = { navigate: jest.fn() };
  const localization = { translate: jest.fn((key: string) => key) };
  const toast = { error: jest.fn() };

  function create(): LoginComponent {
    jest.resetAllMocks();
    localization.translate.mockImplementation((key: string) => key);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthState, useValue: auth },
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

  it("navigates home after an AUTHENTICATED login", () => {
    const component = create();
    auth.login.mockReturnValue(
      of({ status: "AUTHENTICATED", session: { user: {}, memberships: [] } }),
    );

    component.login();

    expect(router.navigate).toHaveBeenCalledWith(["/"]);
    expect(component.submitting).toBe(false);
  });

  it.each([
    [{ status: "MFA_REQUIRED", methods: ["TOTP", "RECOVERY", "EMAIL"] }],
    [{ status: "MFA_ENROLLMENT_REQUIRED" }],
  ])(
    "shows the generic error for %p until the code step exists",
    (response) => {
      const component = create();
      auth.login.mockReturnValue(of(response));

      component.login();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.error).toBe("auth.loginFailed");
      expect(component.submitting).toBe(false);
    },
  );
});
