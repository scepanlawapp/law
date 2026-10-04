import { inject, Injectable } from "@angular/core";
import type { ClientBillingProfile } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { map, Observable } from "rxjs";
import {
  ClientRateDialogComponent,
  ClientRateDialogInput,
} from "./client-rate-dialog.component";

@Injectable({ providedIn: "root" })
export class ClientRateDialogService {
  private readonly dialog = inject(HlmDialogService);

  /** Emits the saved profile, or `null` when the dialog is dismissed. */
  open(input: ClientRateDialogInput): Observable<ClientBillingProfile | null> {
    return this.dialog
      .open<
        ClientBillingProfile | undefined,
        ClientRateDialogInput
      >(ClientRateDialogComponent, { context: input, contentClass: "sm:max-w-md" })
      .closed$.pipe(map((profile) => profile ?? null));
  }
}
