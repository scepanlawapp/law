import { Injectable, inject } from "@angular/core";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { Observable, filter, map } from "rxjs";
import { PasswordConfirmDialogComponent } from "./password-confirm-dialog.component";

export interface PasswordConfirmOptions<T> {
  /** Translation keys. */
  title: string;
  description: string;
  confirmText: string;
  /** Runs the protected action with the typed password; errors stay in the dialog. */
  run: (currentPassword: string) => Observable<T>;
}

export interface PasswordConfirmData extends PasswordConfirmOptions<unknown> {
  destructive: boolean;
}

/**
 * Asks for the current password and runs the protected action inside the
 * dialog, so a wrong password can be retried without losing the context.
 * Emits the action's result once; completes silently when cancelled.
 */
@Injectable({ providedIn: "root" })
export class PasswordConfirmDialogService {
  private readonly dialog = inject(HlmDialogService);

  open<T>(
    options: PasswordConfirmOptions<T> & { destructive?: boolean },
  ): Observable<T> {
    const ref = this.dialog.open<
      { result: T } | undefined,
      PasswordConfirmData
    >(PasswordConfirmDialogComponent, {
      context: { ...options, destructive: options.destructive ?? false },
      contentClass: "sm:max-w-md",
    });
    return ref.closed$.pipe(
      filter((outcome): outcome is { result: T } => outcome !== undefined),
      map((outcome) => outcome.result),
    );
  }
}
