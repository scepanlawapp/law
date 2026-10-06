import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { DocumentAssociationsDialogComponent } from "./document-associations-dialog.component";
import {
  DocumentAssociationsDialogContext,
  DocumentAssociationsDialogResult,
} from "./document-associations-dialog.models";

@Injectable({ providedIn: "root" })
export class DocumentAssociationsDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    context: DocumentAssociationsDialogContext,
  ): Observable<DocumentAssociationsDialogResult | undefined> {
    return this.dialog.open<
      DocumentAssociationsDialogResult,
      DocumentAssociationsDialogContext
    >(DocumentAssociationsDialogComponent, {
      context,
      contentClass:
        "w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl",
    }).closed$;
  }
}
