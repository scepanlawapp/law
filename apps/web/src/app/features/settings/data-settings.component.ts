import { Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-data-settings",
  standalone: true,
  imports: [MatButtonModule, TranslatePipe],
  templateUrl: "./data-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class DataSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly localization = inject(LocalizationService);
  readonly clearing = signal(false);
  readonly message = signal("");
  readonly error = signal("");
  clearHistory(): void {
    if (
      !window.confirm(
        this.localization.translate("settings.clearHistoryConfirm"),
      )
    )
      return;
    this.clearing.set(true);
    this.api.clearConversationHistory().subscribe({
      next: (result) => {
        this.message.set("settings.historyDeleted");
        this.clearing.set(false);
      },
      error: () => {
        this.error.set("settings.historyDeleteError");
        this.clearing.set(false);
      },
    });
  }
}
