import { Injectable, inject } from "@angular/core";
import { BillableWorkItem, ClientSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable } from "rxjs";
import { InvoiceLineImportDialogComponent } from "./invoice-line-import-dialog.component";
import { InvoiceLineImportDialogContext } from "./invoice-line-import-dialog.models";

@Injectable({ providedIn: "root" })
export class InvoiceLineImportDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    client: ClientSummary,
    excludedSourceKeys: string[],
  ): Observable<BillableWorkItem[] | undefined> {
    return this.dialog.open<BillableWorkItem[], InvoiceLineImportDialogContext>(
      InvoiceLineImportDialogComponent,
      {
        context: { client, excludedSourceKeys },
        contentClass:
          "flex max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] flex-col sm:max-w-4xl",
      },
    ).closed$;
  }
}
