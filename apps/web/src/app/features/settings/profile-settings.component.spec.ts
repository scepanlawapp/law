import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { UserSettingsStore } from "../../core/user-settings/user-settings.store";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ProfileSettingsComponent } from "./profile-settings.component";

// ngx-image-cropper needs URL.createObjectURL, which jsdom lacks.
jest.mock(
  "../../shared/components/user-avatar-drop-dialog/user-avatar-drop-dialog.component",
  () => ({
    AvatarCropDialogComponent: class {},
    REMOVE_PROFILE_IMAGE: "remove",
  }),
);

describe("ProfileSettingsComponent", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // no layout in jsdom
      }
      unobserve(): void {
        // no layout in jsdom
      }
      disconnect(): void {
        // no layout in jsdom
      }
    };
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: UserSettingsStore,
          useValue: {
            profile: signal({ email: "u@example.com" }),
            preferences: signal(null),
            loading: signal(false),
          },
        },
        { provide: UserSettingsApiClient, useValue: {} },
        {
          provide: ToastService,
          useValue: { success: jest.fn(), error: jest.fn() },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  it("has no password form and links to the security settings", () => {
    const fixture = TestBed.createComponent(ProfileSettingsComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector("#currentPassword")).toBeNull();
    expect(root.querySelector("#newPassword")).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>(
      "[data-testid='security-link'] a",
    );
    expect(link?.getAttribute("href")).toBe("/settings/security");
  });
});
