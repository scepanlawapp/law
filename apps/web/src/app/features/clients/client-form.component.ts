import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { LegalClientsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-client-form",
  standalone: true,
  imports: [
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmTextarea,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: "./client-form.component.html",
})
export class ClientFormComponent {
  private readonly api = inject(LegalClientsApiClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly type = signal<"PERSON" | "ORGANIZATION">("PERSON");
  readonly saving = signal(false);
  readonly form = new FormGroup({
    firstName: new FormControl("", { nonNullable: true }),
    lastName: new FormControl("", { nonNullable: true }),
    legalName: new FormControl("", { nonNullable: true }),
    tradeName: new FormControl("", { nonNullable: true }),
    notes: new FormControl("", { nonNullable: true }),
  });

  setType(type: "PERSON" | "ORGANIZATION"): void {
    this.type.set(type);
    this.form.markAsPristine();
  }

  save(): void {
    const value = this.form.getRawValue();
    const valid =
      this.type() === "PERSON"
        ? Boolean(value.firstName.trim() && value.lastName.trim())
        : Boolean(value.legalName.trim());
    if (!valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.api
      .create({
        type: this.type(),
        firstName:
          this.type() === "PERSON" ? value.firstName.trim() : undefined,
        lastName: this.type() === "PERSON" ? value.lastName.trim() : undefined,
        legalName:
          this.type() === "ORGANIZATION" ? value.legalName.trim() : undefined,
        tradeName:
          this.type() === "ORGANIZATION"
            ? value.tradeName.trim() || undefined
            : undefined,
        notes: value.notes.trim() || undefined,
      })
      .subscribe({
        next: (client) => {
          this.toast.success("Client saved.");
          void this.router.navigate(["/clients", client.id]);
        },
        error: () => {
          this.toast.error("Client could not be saved.");
          this.saving.set(false);
        },
      });
  }
}
