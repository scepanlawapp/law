import {
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCamera } from "@ng-icons/lucide";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

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

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "size-6 text-sm",
  sm: "size-8 text-sm",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
};

const CAMERA_ICON_SIZES: Record<AvatarSize, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
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
  readonly user = input.required<UserAvatarInput | null | undefined>();
  readonly size = input<AvatarSize>("md");
  readonly showName = input(false);
  readonly fallbackLabel = input("Unknown user");
  readonly editable = input(false);
  readonly editLabel = input<string | null>(null);

  readonly avatarClick = output<MouseEvent>();

  protected readonly sizeClasses = computed(() => SIZE_CLASSES[this.size()]);
  protected readonly cameraIconSize = computed(
    () => CAMERA_ICON_SIZES[this.size()],
  );

  protected readonly editAriaLabel = computed(
    () => this.editLabel() || `Change photo for ${this.displayName()}`,
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

    return fullName || name || username || email || this.fallbackLabel();
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
