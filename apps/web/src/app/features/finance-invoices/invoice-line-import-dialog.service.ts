import { Injectable, inject } from "@angular/core";
import { ClientSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable } from "rxjs";
import { InvoiceLineImportDialogComponent } from "./invoice-line-import-dialog.component";
import {
  InvoiceLineImportDialogContext,
  InvoiceLineImportResult,
} from "./invoice-line-import-dialog.models";

@Injectable({ providedIn: "root" })
export class InvoiceLineImportDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    client: ClientSummary,
    excludedEntryIds: string[],
  ): Observable<InvoiceLineImportResult | undefined> {
    return this.dialog.open<
      InvoiceLineImportResult,
      InvoiceLineImportDialogContext
    >(InvoiceLineImportDialogComponent, {
      context: { client, excludedEntryIds },
      contentClass:
        "flex max-h-[90dvh] w-[min(76rem,calc(100vw-2rem))] flex-col sm:max-w-7xl",
    }).closed$;
  }
}
