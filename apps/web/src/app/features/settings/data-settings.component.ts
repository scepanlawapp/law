import { Component, inject, signal } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";

@Component({
  selector: "app-data-settings",
  standalone: true,
  imports: [HlmButton, TranslatePipe],
  templateUrl: "./data-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class DataSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  readonly clearing = signal(false);
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
            this.toast.success(
              this.localization.translate("settings.historyDeleted"),
            );
            this.clearing.set(false);
          },
          error: () => {
            this.toast.error(
              this.localization.translate("settings.historyDeleteError"),
            );
            this.clearing.set(false);
          },
        });
      });
  }
}
