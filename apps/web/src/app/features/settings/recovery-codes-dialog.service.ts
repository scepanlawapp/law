import { Injectable, inject } from "@angular/core";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { RecoveryCodesDialogComponent } from "./recovery-codes-dialog.component";

export interface RecoveryCodesDialogData {
  codes: string[];
}

/** Shows freshly generated recovery codes once, with copy and download. */
@Injectable({ providedIn: "root" })
export class RecoveryCodesDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(codes: string[]): void {
    this.dialog.open<unknown, RecoveryCodesDialogData>(
      RecoveryCodesDialogComponent,
      {
        context: { codes },
        disableClose: true,
        contentClass: "sm:max-w-md",
      },
    );
  }
}
