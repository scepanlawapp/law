import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { UserSettingsApiClient } from "@law/api-clients";
import { UserSettingsDateTimeFormat } from "@law/api-interfaces";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-workspace-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslatePipe,
  ],
  templateUrl: "./workspace-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class WorkspaceSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal("");
  readonly error = signal("");
  readonly form = new FormGroup({
    workspaceNotifications: new FormControl(true, { nonNullable: true }),
    dateTimeFormat: new FormControl<UserSettingsDateTimeFormat>(
      "TWENTY_FOUR_HOUR",
      { nonNullable: true },
    ),
    timeZone: new FormControl("Europe/Belgrade", { nonNullable: true }),
  });
  constructor() {
    this.api.get().subscribe({
      next: (s) => {
        this.form.patchValue(s.preferences);
        this.loading.set(false);
      },
      error: () => {
        this.error.set("settings.workspaceLoadError");
        this.loading.set(false);
      },
    });
  }
  save(): void {
    this.saving.set(true);
    this.api.update({ preferences: this.form.getRawValue() }).subscribe({
      next: () => {
        this.message.set("settings.workspaceSaved");
        this.saving.set(false);
      },
      error: () => {
        this.error.set("settings.workspaceSaveError");
        this.saving.set(false);
      },
    });
  }
}
