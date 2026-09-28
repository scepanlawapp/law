import { Component, inject } from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { ClientSummary } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { CandidateClientDialogContext } from "./candidate-client-dialog.models";

@Component({
  selector: "law-candidate-client-dialog",
  standalone: true,
  templateUrl: "./candidate-client-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmSelectImports,
    TranslatePipe,
  ],
})
export class CandidateClientDialogComponent {
  readonly context = injectBrnDialogContext<CandidateClientDialogContext>();
  readonly dialogRef = inject(BrnDialogRef<ClientSummary>);
  readonly form = new FormGroup({
    clientId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly clientItemToString = (value: string | null | undefined): string =>
    this.context.clients.find((client) => client.id === value)?.displayName ??
    "";

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const client = this.context.clients.find(
      (item) => item.id === this.form.controls.clientId.value,
    );
    if (client) this.dialogRef.close(client);
  }
}
