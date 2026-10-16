import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCamera } from "@ng-icons/lucide";
import { LocalizationService } from "../../../core/localization/localization.service";

export const AvatarSize = {
  XS: "xs",
  SM: "sm",
  MD: "md",
  LG: "lg",
  XL: "xl",
} as const;
export type AvatarSize = (typeof AvatarSize)[keyof typeof AvatarSize];

export interface UserAvatarInput {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}

const SIZE_CLASSES: Readonly<Record<AvatarSize, string>> = {
  [AvatarSize.XS]: "size-6 text-sm",
  [AvatarSize.SM]: "size-8 text-sm",
  [AvatarSize.MD]: "size-10 text-sm",
  [AvatarSize.LG]: "size-12 text-base",
  [AvatarSize.XL]: "size-16 text-xl",
};

const CAMERA_ICON_SIZES: Readonly<Record<AvatarSize, string>> = {
  [AvatarSize.XS]: "size-3",
  [AvatarSize.SM]: "size-3.5",
  [AvatarSize.MD]: "size-4",
  [AvatarSize.LG]: "size-5",
  [AvatarSize.XL]: "size-6",
};

@Component({
  selector: "law-user-avatar",
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ lucideCamera })],
  templateUrl: "./user-avatar.component.html",
  host: {
    class: "inline-flex min-w-0 max-w-full items-center gap-2 align-middle",
  },
})
export class UserAvatarComponent {
  private readonly localization = inject(LocalizationService);

  readonly user = input.required<UserAvatarInput | null | undefined>();
  readonly size = input<AvatarSize>(AvatarSize.MD);
  readonly showName = input(false);
  /** Shown when the user has no name or email; defaults to "Unknown user". */
  readonly fallbackLabel = input<string | null>(null);
  readonly editable = input(false);
  readonly editLabel = input<string | null>(null);

  readonly avatarClick = output<MouseEvent>();

  protected readonly sizeClasses = computed(() => SIZE_CLASSES[this.size()]);
  protected readonly cameraIconSize = computed(
    () => CAMERA_ICON_SIZES[this.size()],
  );

  protected readonly editAriaLabel = computed(
    () =>
      this.editLabel() ||
      this.localization.translate("userAvatar.changePhotoFor", {
        name: this.displayName(),
      }),
  );

  private readonly identity = computed(() => {
    const user = this.user();
    const name = user?.name ?? "";

    return {
      firstName: user?.firstName?.trim() ?? "",
      lastName: user?.lastName?.trim() ?? "",
      username: user?.username?.trim() ?? "",
      name: name.trim(),
      email: user?.email?.trim() ?? "",
      avatarUrl: user?.avatarUrl?.trim() ?? "",
    };
  });

  // A new user value resets a failed image, allowing a fresh attempt.
  private readonly imageFailed = linkedSignal({
    source: this.identity,
    computation: () => false,
  });

  protected readonly displayName = computed(() => {
    const { firstName, lastName, username, name, email } = this.identity();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    return (
      fullName ||
      name ||
      username ||
      email ||
      this.fallbackLabel() ||
      this.localization.translate("userAvatar.unknownUser")
    );
  });

  protected readonly initials = computed(() => {
    const { firstName, lastName, username, name, email } = this.identity();

    if (firstName || lastName) {
      return (
        this.firstCharacters(firstName, 1) + this.firstCharacters(lastName, 1)
      );
    }

    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        return (
          this.firstCharacters(parts[0], 1) + this.firstCharacters(parts[1], 1)
        );
      }
      return this.firstCharacters(name, 2);
    }

    return this.firstCharacters(username || email, 2) || "?";
  });

  // Tracking the URL recreates the image element when its source changes.
  protected readonly imageSources = computed(() => {
    const url = this.identity().avatarUrl;
    return url && !this.imageFailed() ? [url] : [];
  });

  protected onAvatarClick(event: MouseEvent): void {
    this.avatarClick.emit(event);
  }

  protected onImageError(url: string): void {
    if (url === this.identity().avatarUrl) {
      this.imageFailed.set(true);
    }
  }

  private firstCharacters(value: string, count: number): string {
    return Array.from(value.normalize("NFC"))
      .slice(0, count)
      .join("")
      .toUpperCase();
  }
}
