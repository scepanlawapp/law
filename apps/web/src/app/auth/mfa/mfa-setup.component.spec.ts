import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { AuthState } from "@law/security";
import { MfaSetupComponent } from "./mfa-setup.component";

describe("MfaSetupComponent", () => {
  const auth = { completeLogin: jest.fn() };
  const router = { navigate: jest.fn() };

  function create(): MfaSetupComponent {
    jest.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthState, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.runInInjectionContext(() => new MfaSetupComponent());
  }

  it("starts the session and goes home after challenge enrollment", () => {
    const component = create();
    const session = { user: {}, memberships: [] } as never;

    component.onCompleted({ session });

    expect(auth.completeLogin).toHaveBeenCalledWith(session);
    expect(router.navigate).toHaveBeenCalledWith(["/"]);
  });

  it("falls back to the login page when no session came back", () => {
    const component = create();

    component.onCompleted({});

    expect(auth.completeLogin).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(["/login"]);
  });
});
