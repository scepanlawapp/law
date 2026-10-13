import { Injectable, inject } from "@angular/core";
import { FinancialsApiClient } from "@law/api-clients";
import { PriceSourceSummary } from "@law/api-interfaces";
import { map, of, switchMap } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
@Injectable({ providedIn: "root" })
export class PriceCatalogDeleteService {
  private readonly confirm = inject(ConfirmDialogService);
  private readonly api = inject(FinancialsApiClient);
  remove(source: PriceSourceSummary) {
    return this.confirm
      .confirm({
        title: "finance.deleteCatalog",
        message: "finance.deleteCatalogConfirm",
        confirmText: "finance.deleteCatalog",
        variant: "danger",
      })
      .pipe(
        switchMap((confirmed) =>
          confirmed
            ? this.api
                .deletePriceSource(source.id)
                .pipe(map((result) => result.deleted))
            : of(false),
        ),
      );
  }
}
