import { inject, Injectable } from "@angular/core";
import { PaymentDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { of, switchMap } from "rxjs";
import { PaymentFormComponent } from "./payment-form.component";
import { PaymentDetailComponent } from "./payment-detail.component";
import {
  PaymentFormContext,
  PaymentViewContext,
  PaymentViewResult,
} from "./payment-dialog.models";
@Injectable({ providedIn: "root" })
export class PaymentDialogService {
  private readonly dialog = inject(HlmDialogService);
  form(context: PaymentFormContext = {}) {
    return this.dialog.open<PaymentDetail, PaymentFormContext>(
      PaymentFormComponent,
      {
        context,
        contentClass: "w-[calc(100vw-2rem)] sm:max-w-7xl",
        autoFocus: "dialog",
      },
    ).closed$;
  }
  view(id: string) {
    return this.dialog
      .open<PaymentViewResult, PaymentViewContext>(PaymentDetailComponent, {
        context: { id },
        contentClass: "w-[calc(100vw-2rem)] sm:max-w-6xl",
        autoFocus: "dialog",
      })
      .closed$.pipe(
        switchMap((result) =>
          result?.edit ? this.form({ id }) : of(result?.payment),
        ),
      );
  }
}
