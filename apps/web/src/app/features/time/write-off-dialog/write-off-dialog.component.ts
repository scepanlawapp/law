import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/** Collects the reason a work entry is written off; closes with the trimmed text. */
@Component({
  selector: "law-write-off-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmTextarea,
    TranslatePipe,
  ],
  templateUrl: "./write-off-dialog.component.html",
})
export class WriteOffDialogComponent {
  private readonly dialogRef =
    inject<BrnDialogRef<string | undefined>>(BrnDialogRef);

  readonly reason = new FormControl("", {
    nonNullable: true,
    validators: [
      Validators.required,
      (control) => (control.value.trim() ? null : { required: true }),
    ],
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    this.dialogRef.close(this.reason.value.trim());
  }
}
