import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { OverlayContainer } from "@angular/cdk/overlay";
import { HlmSidebarService } from "@spartan-ng/helm/sidebar";
import { LocalizationService } from "../../../core/localization/localization.service";
import { UserSettingsStore } from "../../../core/user-settings/user-settings.store";
import { UserMenuComponent } from "./user-menu.component";

describe("UserMenuComponent sidebar dropdown", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        provideRouter([]),
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
        {
          provide: UserSettingsStore,
          useValue: {
            profile: signal({ firstName: "Ana", lastName: "Advokat" }),
          },
        },
      ],
    }).compileComponents();
  });

  it.each(["keyboard", "pointer"])(
    "opens with %s when collapsed and keeps settings and logout available",
    async (interaction) => {
      const sidebar = TestBed.inject(HlmSidebarService);
      sidebar.setOpen(false);
      const fixture = TestBed.createComponent(UserMenuComponent);
      fixture.componentRef.setInput("user", {
        id: "user-1",
        name: "Ana Advokat",
        email: "ana@example.test",
      });
      fixture.detectChanges();
      const trigger = fixture.nativeElement.querySelector(
        "button",
      ) as HTMLButtonElement;
      expect(trigger.getAttribute("aria-label")).toBe("header.userMenu");
      await fixture.whenStable();
      const setOpenMobile = jest.spyOn(sidebar, "setOpenMobile");
      trigger.focus();
      if (interaction === "pointer") trigger.click();
      else
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            keyCode: 13,
            code: "Enter",
            bubbles: true,
          }),
        );
      fixture.detectChanges();
      await fixture.whenStable();
      const overlay = TestBed.inject(OverlayContainer).getContainerElement();
      expect(overlay.querySelector('a[href="/settings"]')).not.toBeNull();
      expect(setOpenMobile).not.toHaveBeenCalledWith(false);
      const logout = overlay.querySelector("button") as HTMLButtonElement;
      const logoutSpy = jest.fn();
      fixture.componentInstance.logoutRequested.subscribe(logoutSpy);
      logout.click();
      fixture.detectChanges();
      expect(logoutSpy).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.menuOpen()).toBe(false);
    },
  );
});
