import { Injectable, inject } from "@angular/core";
import {
  BillingStatementLineSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable } from "rxjs";
import { BillingStatementLineImportDialogComponent } from "./billing-statement-line-import-dialog.component";
import { BillingStatementLineImportDialogContext } from "./billing-statement-line-import-dialog.models";

@Injectable({ providedIn: "root" })
export class BillingStatementLineImportDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    client: ClientSummary,
    excludedLineIds: string[],
  ): Observable<BillingStatementLineSummary[] | undefined> {
    return this.dialog.open<
      BillingStatementLineSummary[],
      BillingStatementLineImportDialogContext
    >(BillingStatementLineImportDialogComponent, {
      context: { client, excludedLineIds },
      contentClass:
        "flex max-h-[90dvh] w-[min(64rem,calc(100vw-2rem))] max-w-5xl flex-col",
    }).closed$;
  }
}
