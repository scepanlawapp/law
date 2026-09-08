import { Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";

@Component({
  selector: "app-data-settings",
  standalone: true,
  imports: [MatButtonModule, TranslatePipe],
  templateUrl: "./data-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class DataSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  readonly clearing = signal(false);
  readonly message = signal("");
  readonly error = signal("");
  clearHistory(): void {
    this.confirmDialog
      .confirm({
        title: this.localization.translate("settings.clearHistory"),
        message: this.localization.translate("settings.clearHistoryConfirm"),
        confirmText: this.localization.translate("settings.clearHistoryAction"),
        cancelText: this.localization.translate("settings.cancel"),
        variant: "danger",
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.clearing.set(true);
        this.api.clearConversationHistory().subscribe({
          next: () => {
            this.message.set("settings.historyDeleted");
            this.clearing.set(false);
          },
          error: () => {
            this.error.set("settings.historyDeleteError");
            this.clearing.set(false);
          },
        });
      });
  }
}
