import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { DocumentUploadDialogComponent } from "./document-upload-dialog.component";
import {
  DocumentUploadDialogContext,
  DocumentUploadDialogResult,
} from "./document-upload-dialog.models";

@Injectable({ providedIn: "root" })
export class DocumentUploadDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    context: DocumentUploadDialogContext = {},
  ): Observable<DocumentUploadDialogResult | undefined> {
    return this.dialog.open<
      DocumentUploadDialogResult,
      DocumentUploadDialogContext
    >(DocumentUploadDialogComponent, {
      context,
      disableClose: true,
      closeOnOutsidePointerEvents: false,
      showCloseButton: false,
      contentClass:
        "sm:max-w-6xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
    }).closed$;
  }
}
