import { Component, inject, signal, viewChild } from "@angular/core";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import {
  HlmDialogDescription,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { ImageCropperComponent } from "ngx-image-cropper";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

@Component({
  selector: "law-avatar-crop-dialog",
  standalone: true,
  imports: [
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmButton,
    ImageCropperComponent,
    TranslatePipe,
  ],
  templateUrl: "./user-avatar-drop-dialog.component.html",
  host: {
    class: "flex min-w-0 flex-col gap-5",
  },
})
export class AvatarCropDialogComponent {
  private readonly dialogRef = inject(BrnDialogRef);
  private readonly localization = inject(LocalizationService);
  private readonly cropper = viewChild(ImageCropperComponent);

  readonly imageFile = signal<File | null>(null);
  readonly ready = signal(false);
  readonly cropping = signal(false);
  readonly error = signal("");

  selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Allow selecting the same file again.
    input.value = "";

    if (!file || this.cropping()) {
      return;
    }

    this.error.set("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      this.error.set(
        this.localization.translate("settings.avatarCrop.invalidType"),
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.error.set(
        this.localization.translate("settings.avatarCrop.tooLarge"),
      );
      return;
    }

    this.ready.set(false);
    this.imageFile.set(file);
  }

  imageFailed(): void {
    this.ready.set(false);
    this.error.set(
      this.localization.translate("settings.avatarCrop.loadError"),
    );
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async apply(): Promise<void> {
    const cropper = this.cropper();

    if (!cropper || !this.ready() || this.cropping()) {
      return;
    }

    this.cropping.set(true);
    this.error.set("");

    try {
      const result = await cropper.crop("blob");

      if (!result?.blob) {
        throw new Error("No cropped image was generated.");
      }

      const file = new File([result.blob], "avatar.png", {
        type: "image/png",
      });

      this.dialogRef.close(file);
    } catch {
      this.error.set(
        this.localization.translate("settings.avatarCrop.cropError"),
      );
    } finally {
      this.cropping.set(false);
    }
  }
}
