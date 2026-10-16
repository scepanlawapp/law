import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import type { PasswordConfirmData } from "./password-confirm-dialog.service";

@Component({
  selector: "law-password-confirm-dialog",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSpinner,
    TranslatePipe,
  ],
  templateUrl: "./password-confirm-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordConfirmDialogComponent {
  readonly data = injectBrnDialogContext<PasswordConfirmData>();
  private readonly dialogRef = inject(BrnDialogRef<{ result: unknown }>);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    currentPassword: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly submitting = signal(false);
  /** Translation key of the inline error, or empty. */
  readonly errorKey = signal("");

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorKey.set("");
    this.data
      .run(this.form.controls.currentPassword.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.dialogRef.close({ result }),
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.form.controls.currentPassword.reset();
          this.errorKey.set(
            error.status === 401
              ? "auth.mfa.passwordInvalid"
              : error.status === 409
                ? "security.actionConflict"
                : "security.actionFailed",
          );
        },
      });
  }
}
