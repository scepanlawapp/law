import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import {
  StarterPickerResult,
  StarterPickKind,
} from "../../assistant-starter-prompts";
import { StarterPickerDialogComponent } from "./starter-picker-dialog.component";

export interface StarterPickerContext {
  kind: StarterPickKind;
}

/** Opens the searchable client/case/colleague/document picker for a starter card. */
@Injectable({ providedIn: "root" })
export class StarterPickerService {
  private readonly dialog = inject(HlmDialogService);

  open(kind: StarterPickKind): Observable<StarterPickerResult> {
    return this.dialog.open<StarterPickerResult, StarterPickerContext>(
      StarterPickerDialogComponent,
      {
        context: { kind },
        // grid-cols-1 = minmax(0, 1fr): without it the dialog's auto column
        // grows to the longest untruncated title and the list overflows.
        contentClass: "sm:max-w-lg grid-cols-1",
      },
    ).closed$;
  }
}
