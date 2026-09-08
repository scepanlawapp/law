import { Injectable, inject } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
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
  private readonly dialog = inject(MatDialog);

  confirm(options: ConfirmDialogOptions): Observable<boolean> {
    const dialogRef = this.dialog.open<
      ConfirmDialogComponent,
      ConfirmDialogData,
      boolean
    >(ConfirmDialogComponent, {
      data: {
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Confirm",
        cancelText: options.cancelText ?? "Cancel",
        variant: options.variant ?? "default",
      },
      disableClose: options.disableClose ?? false,
      autoFocus: "dialog",
      restoreFocus: true,
      maxWidth: "calc(100vw - 2rem)",
      panelClass: "confirm-dialog-panel",
      backdropClass: "confirm-dialog-backdrop",
    });

    return dialogRef.afterClosed().pipe(map((confirmed) => confirmed === true));
  }
}
