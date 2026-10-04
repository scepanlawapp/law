import { inject, Injectable } from "@angular/core";
import { WorkEntry } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { map, Observable, of, take } from "rxjs";
import { QuickCaptureDialogComponent } from "./quick-capture-dialog.component";
import { QuickCaptureInput } from "./quick-capture.models";

export type { QuickCaptureInput } from "./quick-capture.models";

@Injectable({ providedIn: "root" })
export class QuickCaptureDialogService {
  private readonly dialog = inject(HlmDialogService);
  private isOpen = false;

  /** Emits the saved entry, or `null` when the dialog is dismissed. */
  open(
    input: QuickCaptureInput = { mode: "create" },
  ): Observable<WorkEntry | null> {
    // The Alt+W shortcut and the header button must not stack dialogs.
    if (this.isOpen) return of(null);
    this.isOpen = true;
    const closed$ = this.dialog.open<WorkEntry | undefined, QuickCaptureInput>(
      QuickCaptureDialogComponent,
      {
        context: input,
        contentClass:
          "sm:max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden",
      },
    ).closed$;
    closed$.pipe(take(1)).subscribe(() => (this.isOpen = false));
    return closed$.pipe(map((entry) => entry ?? null));
  }
}
