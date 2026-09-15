import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { MattersApiClient } from "@law/api-clients";
import { CreateMatterRequest } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-matter-form",
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
  templateUrl: "./matter-form.component.html",
})
export class MatterFormComponent {
  private readonly api = inject(MattersApiClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly openAfterSave = signal(false);
  readonly form = new FormGroup({
    title: new FormControl("", { nonNullable: true }),
    description: new FormControl("", { nonNullable: true }),
    priority: new FormControl<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL", {
      nonNullable: true,
    }),
  });

  save(open: boolean): void {
    const value = this.form.getRawValue();
    if (!value.title.trim()) {
      this.form.controls.title.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.openAfterSave.set(open);
    const request: CreateMatterRequest = {
      title: value.title.trim(),
      description: value.description.trim() || undefined,
      priority: value.priority,
    };
    this.api.create(request).subscribe({
      next: (matter) => {
        if (!open) {
          this.toast.success("Matter draft saved.");
          void this.router.navigate(["/cases", matter.id]);
          return;
        }
        this.api.open(matter.id).subscribe({
          next: (opened) => {
            this.toast.success(`Matter ${opened.internalNumber ?? ""} opened.`);
            void this.router.navigate(["/cases", opened.id]);
          },
          error: () => {
            this.toast.error("Matter could not be opened.");
            this.saving.set(false);
          },
        });
      },
      error: () => {
        this.toast.error("Matter could not be saved.");
        this.saving.set(false);
      },
    });
  }
}
