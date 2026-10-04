import { Injectable, inject } from "@angular/core";
import { ClientSummary, WorkEntry } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable } from "rxjs";
import { BillingStatementLineImportDialogComponent } from "./billing-statement-line-import-dialog.component";
import { BillingStatementLineImportDialogContext } from "./billing-statement-line-import-dialog.models";

@Injectable({ providedIn: "root" })
export class BillingStatementLineImportDialogService {
  private readonly dialog = inject(HlmDialogService);

  /** Emits the chosen unbilled work entries, or `undefined` when dismissed. */
  open(
    client: ClientSummary,
    excludedEntryIds: string[],
  ): Observable<WorkEntry[] | undefined> {
    return this.dialog.open<
      WorkEntry[],
      BillingStatementLineImportDialogContext
    >(BillingStatementLineImportDialogComponent, {
      context: { client, excludedEntryIds },
      contentClass:
        "flex max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] flex-col sm:max-w-4xl",
    }).closed$;
  }
}
