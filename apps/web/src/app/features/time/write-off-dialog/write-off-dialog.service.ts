import { inject, Injectable } from "@angular/core";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { map, Observable } from "rxjs";
import { WriteOffDialogComponent } from "./write-off-dialog.component";

@Injectable({ providedIn: "root" })
export class WriteOffDialogService {
  private readonly dialog = inject(HlmDialogService);

  /** Emits the entered reason, or `null` when the dialog is dismissed. */
  open(): Observable<string | null> {
    return this.dialog
      .open<string | undefined>(WriteOffDialogComponent, {
        contentClass: "sm:max-w-md",
      })
      .closed$.pipe(map((reason) => reason?.trim() || null));
  }
}
