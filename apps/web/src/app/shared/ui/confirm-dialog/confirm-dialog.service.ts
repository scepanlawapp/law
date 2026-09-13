import { Injectable, inject } from "@angular/core";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable, map } from "rxjs";
import { ConfirmDialogComponent } from "./confirm-dialog.component";

export type ConfirmDialogVariant = "default" | "warning" | "danger";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
  disableClose?: boolean;
}

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: ConfirmDialogVariant;
}

@Injectable({ providedIn: "root" })
export class ConfirmDialogService {
  private readonly dialog = inject(HlmDialogService);

  confirm(options: ConfirmDialogOptions): Observable<boolean> {
    const dialogRef = this.dialog.open<boolean, ConfirmDialogData>(
      ConfirmDialogComponent,
      {
        context: {
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? "Confirm",
          cancelText: options.cancelText ?? "Cancel",
          variant: options.variant ?? "default",
        },
        disableClose: options.disableClose ?? false,
      },
    );

    return dialogRef.closed$.pipe(map((confirmed) => confirmed === true));
  }
}
