import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  RECOVERY_CODES_FILE_NAME,
  copyTextToClipboard,
  downloadTextFile,
  recoveryCodesFileText,
} from "../../auth/mfa/mfa-code";
import type { RecoveryCodesDialogData } from "./recovery-codes-dialog.service";

@Component({
  selector: "law-recovery-codes-dialog",
  standalone: true,
  imports: [
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    TranslatePipe,
  ],
  templateUrl: "./recovery-codes-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryCodesDialogComponent {
  readonly data = injectBrnDialogContext<RecoveryCodesDialogData>();
  private readonly dialogRef = inject(BrnDialogRef);
  private readonly localization = inject(LocalizationService);

  readonly codesSaved = signal(false);
  readonly copied = signal(false);

  async copy(): Promise<void> {
    const copied = await copyTextToClipboard(this.data.codes.join("\n"));
    this.copied.set(copied);
    if (copied) setTimeout(() => this.copied.set(false), 2000);
  }

  download(): void {
    downloadTextFile(
      recoveryCodesFileText(
        this.data.codes,
        this.localization.translate("auth.mfa.downloadHeader"),
      ),
      RECOVERY_CODES_FILE_NAME,
    );
  }

  setCodesSaved(saved: boolean): void {
    this.codesSaved.set(saved);
  }

  close(): void {
    if (this.codesSaved()) this.dialogRef.close(undefined);
  }
}
