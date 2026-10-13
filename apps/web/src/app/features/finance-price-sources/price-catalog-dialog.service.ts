import { Injectable, inject } from "@angular/core";
import { PriceSourceSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { PriceCatalogDialogComponent } from "./price-catalog-dialog.component";
@Injectable({ providedIn: "root" })
export class PriceCatalogDialogService {
  private readonly dialog = inject(HlmDialogService);
  open(source: PriceSourceSummary) {
    return this.dialog.open<boolean, { source: PriceSourceSummary }>(
      PriceCatalogDialogComponent,
      {
        context: { source },
        contentClass: "sm:max-w-3xl max-h-[90dvh] overflow-y-auto",
      },
    ).closed$;
  }
}
