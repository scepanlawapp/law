import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NoteDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { NoteDialogComponent } from "./note-dialog.component";
import { NoteDialogContext } from "./note-dialog.models";

@Injectable({ providedIn: "root" })
export class NoteDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(context: NoteDialogContext): Observable<NoteDetail | undefined> {
    return this.dialog.open<NoteDetail, NoteDialogContext>(
      NoteDialogComponent,
      {
        context,
        contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
      },
    ).closed$;
  }
}
