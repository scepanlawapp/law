import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { Subject, of, throwError } from "rxjs";
import { PasswordConfirmDialogComponent } from "./password-confirm-dialog.component";

const run = jest.fn();

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => ({
    title: "t",
    description: "d",
    confirmText: "c",
    destructive: false,
    run: (password: string) => run(password),
  }),
}));

describe("PasswordConfirmDialogComponent", () => {
  // Fresh per test: the component guards `close` on the ref it receives.
  let dialogRef: { close: jest.Mock | ((result?: unknown) => void) };
  let close: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    TestBed.resetTestingModule();
    close = jest.fn();
    dialogRef = { close };
    TestBed.configureTestingModule({
      providers: [{ provide: BrnDialogRef, useValue: dialogRef }],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PasswordConfirmDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it("runs the action with the typed password and closes with its result", () => {
    run.mockReturnValue(of({ ok: true }));
    const { componentInstance: component } = render();

    component.form.setValue({ currentPassword: "secret-pass" });
    component.submit();

    expect(run).toHaveBeenCalledWith("secret-pass");
    expect(close).toHaveBeenCalledWith({ result: { ok: true } });
  });

  it("does not run without a password", () => {
    const { componentInstance: component } = render();

    component.submit();

    expect(run).not.toHaveBeenCalled();
  });

  it("stays open with an inline error on a wrong password", () => {
    run.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const { componentInstance: component } = render();

    component.form.setValue({ currentPassword: "wrong" });
    component.submit();

    expect(close).not.toHaveBeenCalled();
    expect(component.errorKey()).toBe("auth.mfa.passwordInvalid");
    expect(component.submitting()).toBe(false);
  });

  it("closes without a result when cancelled", () => {
    const { componentInstance: component } = render();
    component.cancel();
    expect(close).toHaveBeenCalledWith(undefined);
  });

  it("cannot be closed (Esc, backdrop, X or Cancel) while the action runs, so its result is not lost", () => {
    const pending = new Subject<{ recoveryCodes: string[] }>();
    run.mockReturnValue(pending);
    const fixture = render();
    const component = fixture.componentInstance;

    component.form.setValue({ currentPassword: "secret-pass" });
    component.submit();
    fixture.detectChanges();

    // Esc, backdrop and the X button all end in BrnDialogRef.close().
    dialogRef.close(undefined);
    component.cancel();
    expect(close).not.toHaveBeenCalled();
    const cancelButton = (fixture.nativeElement as HTMLElement).querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);

    pending.next({ recoveryCodes: ["abcd-efgh"] });

    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith({
      result: { recoveryCodes: ["abcd-efgh"] },
    });
  });

  it("can be closed again after the action failed", () => {
    run.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const { componentInstance: component } = render();

    component.form.setValue({ currentPassword: "wrong" });
    component.submit();
    dialogRef.close(undefined);

    expect(close).toHaveBeenCalledWith(undefined);
  });
});
