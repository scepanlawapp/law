import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
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
import { TranslatePipe } from "../../../core/localization/translate.pipe";

export interface ReferenceCreateDialogData {
  title: string;
  description: string;
  nameLabel: string;
}

@Component({
  selector: "app-reference-create-dialog",
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
    TranslatePipe,
  ],
  templateUrl: "./reference-create-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferenceCreateDialogComponent {
  readonly data = injectBrnDialogContext<ReferenceCreateDialogData>();
  private readonly dialogRef = inject(BrnDialogRef<string>);

  readonly form = new FormGroup({
    name: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
  });

  cancel(): void {
    this.dialogRef.close("");
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close(this.form.controls.name.value.trim());
  }
}
