import { Component, inject, signal, viewChild } from "@angular/core";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import {
  HlmDialogDescription,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideImagePlus } from "@ng-icons/lucide";
import { ImageCropperComponent } from "ngx-image-cropper";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

export const REMOVE_PROFILE_IMAGE = "remove-profile-image" as const;
export type AvatarCropDialogResult = File | typeof REMOVE_PROFILE_IMAGE;

@Component({
  selector: "law-avatar-crop-dialog",
  standalone: true,
  imports: [
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmButton,
    NgIcon,
    ImageCropperComponent,
    TranslatePipe,
  ],
  templateUrl: "./user-avatar-drop-dialog.component.html",
  providers: [provideIcons({ lucideImagePlus })],
  host: {
    class: "flex min-w-0 flex-col gap-5",
  },
})
export class AvatarCropDialogComponent {
  private readonly dialogRef = inject(BrnDialogRef);
  private readonly localization = inject(LocalizationService);
  private readonly cropper = viewChild(ImageCropperComponent);
  private dragDepth = 0;

  readonly imageFile = signal<File | null>(null);
  readonly dragging = signal(false);
  readonly ready = signal(false);
  readonly cropping = signal(false);
  readonly error = signal("");

  selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Allow selecting the same file again.
    input.value = "";

    this.setImage(file);
  }

  dragEnter(event: DragEvent): void {
    event.preventDefault();
    if (this.cropping() || !event.dataTransfer?.types.includes("Files")) return;
    this.dragDepth += 1;
    this.dragging.set(true);
  }

  dragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.cropping() ? "none" : "copy";
    }
  }

  dragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  dropImage(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragDepth = 0;
    this.dragging.set(false);
    this.setImage(event.dataTransfer?.files[0]);
  }

  private setImage(file: File | undefined): void {
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

  removeProfileImage(): void {
    if (this.cropping()) {
      return;
    }

    this.dialogRef.close(REMOVE_PROFILE_IMAGE);
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
