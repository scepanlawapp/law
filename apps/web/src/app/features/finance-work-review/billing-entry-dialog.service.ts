import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { BillingStatementLineSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { BillingStatementLineDialogComponent } from "./billing-entry-dialog.component";
import { BillingStatementLineDialogContext } from "./billing-entry-dialog.models";

@Injectable({ providedIn: "root" })
export class BillingStatementLineDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    context: BillingStatementLineDialogContext = {},
  ): Observable<BillingStatementLineSummary[] | undefined> {
    return this.dialog.open<
      BillingStatementLineSummary[],
      BillingStatementLineDialogContext
    >(
      BillingStatementLineDialogComponent,
      {
        context,
        contentClass:
          "sm:max-w-4xl h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
      },
    ).closed$;
  }
}
