import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { BillingEntrySummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { BillingEntryDialogComponent } from "./billing-entry-dialog.component";
import { BillingEntryDialogContext } from "./billing-entry-dialog.models";

@Injectable({ providedIn: "root" })
export class BillingEntryDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    context: BillingEntryDialogContext = {},
  ): Observable<BillingEntrySummary | undefined> {
    return this.dialog.open<BillingEntrySummary, BillingEntryDialogContext>(
      BillingEntryDialogComponent,
      {
        context,
        contentClass:
          "sm:max-w-2xl h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
      },
    ).closed$;
  }
}
