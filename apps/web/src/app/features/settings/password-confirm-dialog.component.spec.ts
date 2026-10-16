import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of, throwError } from "rxjs";
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
  const dialogRef = { close: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
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
    expect(dialogRef.close).toHaveBeenCalledWith({ result: { ok: true } });
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

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.errorKey()).toBe("auth.mfa.passwordInvalid");
    expect(component.submitting()).toBe(false);
  });

  it("closes without a result when cancelled", () => {
    const { componentInstance: component } = render();
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
