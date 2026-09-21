import { Component, DestroyRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { DocumentUploadDialogService } from "./document-upload-modal/document-upload-dialog.service";

@Component({
  selector: "app-documents",
  standalone: true,
  templateUrl: "./documents.component.html",
  imports: [
    HlmButton,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    TranslatePipe,
  ],
})
export class DocumentsComponent {
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly destroyRef = inject(DestroyRef);

  openUpload(): void {
    this.uploadDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}
