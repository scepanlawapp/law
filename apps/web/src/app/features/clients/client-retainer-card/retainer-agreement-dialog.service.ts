import { inject, Injectable } from "@angular/core";
import type { RetainerAgreement } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { map, Observable } from "rxjs";
import {
  RetainerAgreementDialogComponent,
  RetainerAgreementDialogInput,
} from "./retainer-agreement-dialog.component";

@Injectable({ providedIn: "root" })
export class RetainerAgreementDialogService {
  private readonly dialog = inject(HlmDialogService);

  /** Emits the saved agreement, or `null` when the dialog is dismissed. */
  open(
    input: RetainerAgreementDialogInput,
  ): Observable<RetainerAgreement | null> {
    return this.dialog
      .open<
        RetainerAgreement | undefined,
        RetainerAgreementDialogInput
      >(RetainerAgreementDialogComponent, { context: input, contentClass: "sm:max-w-2xl" })
      .closed$.pipe(map((agreement) => agreement ?? null));
  }
}
