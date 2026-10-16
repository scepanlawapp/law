import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { OverlayContainer } from "@angular/cdk/overlay";
import { provideRouter, Router } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { HlmSidebarService } from "@spartan-ng/helm/sidebar";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { SidebarComponent } from "./sidebar.component";

@Component({ standalone: true, template: "" })
class RouteStub {}

describe("SidebarComponent", () => {
  const role = signal(WorkspaceRole.OWNER);

  afterEach(() => jest.restoreAllMocks());

  beforeEach(async () => {
    role.set(WorkspaceRole.OWNER);
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([
          { path: "finance/work-review", component: RouteStub },
          { path: "finance/invoices", component: RouteStub },
          { path: "reports/overview", component: RouteStub },
          { path: "reports/my-earnings", component: RouteStub },
          { path: "cases", component: RouteStub },
        ]),
        {
          provide: AuthState,
          useValue: {
            session: signal(null),
            activeWorkspace: () => ({ role: role() }),
            logout: () => of(undefined),
          },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    }).compileComponents();
  });

  async function render(route = "/cases", collapsed = false, mobile = false) {
    if (mobile) {
      const matchMedia = window.matchMedia.bind(window);
      jest.spyOn(window, "matchMedia").mockImplementation((query) => ({
        ...matchMedia(query),
        matches: query.includes("max-width"),
      }));
    }
    const router = TestBed.inject(Router);
    await router.navigateByUrl(route);
    const sidebar = TestBed.inject(HlmSidebarService);
    sidebar.setOpen(!collapsed);
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    if (mobile) {
      sidebar.setOpenMobile(true);
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return { fixture, router, sidebar };
  }

  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();

  it.each(["nav.finance", "nav.reports"])(
    "opens %s child routes without navigating or expanding the icon sidebar",
    async (label) => {
      const { fixture, router, sidebar } = await render("/cases", true);
      const trigger = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(
        overlay().querySelector(`[role="menu"][aria-label="${label}"]`),
      ).not.toBeNull();
      expect(
        overlay().querySelectorAll('[role="menuitem"]').length,
      ).toBeGreaterThan(0);
      expect(router.url).toBe("/cases");
      expect(sidebar.state()).toBe("collapsed");
    },
  );

  it("marks the current child and navigates only after selecting a route", async () => {
    const { fixture, router, sidebar } = await render(
      "/finance/work-review",
      true,
    );
    const closeMobile = jest.spyOn(sidebar, "setOpenMobile");
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="nav.finance"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      overlay()
        .querySelector('a[href="/finance/work-review"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(router.url).toBe("/finance/work-review");
    overlay()
      .querySelector<HTMLAnchorElement>('a[href="/finance/invoices"]')
      ?.click();
    await fixture.whenStable();

    expect(router.url).toBe("/finance/invoices");
    expect(closeMobile).toHaveBeenCalledWith(false);
    expect(fixture.componentInstance.isRouteActive("/finance")).toBe(true);
    await router.navigateByUrl("/cases");
    expect(fixture.componentInstance.isRouteActive("/finance")).toBe(false);
  });

  it.each([false, true])(
    "keeps owner-only report routes hidden (collapsed: %s)",
    async (collapsed) => {
      role.set(WorkspaceRole.MEMBER);
      const { fixture } = await render("/cases", collapsed);
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('button[aria-label="nav.reports"]')
        ?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const links = Array.from(
        (collapsed
          ? overlay()
          : (fixture.nativeElement as HTMLElement)
        ).querySelectorAll<HTMLAnchorElement>('a[href^="/reports/"]'),
      );
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/reports/my-earnings",
      ]);
    },
  );

  it.each(["nav.finance", "nav.reports"])(
    "toggles %s inline on expanded desktop without a right-side menu",
    async (label) => {
      const { fixture, router, sidebar } = await render();
      const root = fixture.nativeElement as HTMLElement;
      const trigger = root.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      if (!trigger) throw new Error(`Missing inline trigger: ${label}`);
      const content = root.querySelector<HTMLElement>(
        `[id="${trigger.getAttribute("aria-controls")}"]`,
      );
      if (!content) throw new Error(`Missing inline content: ${label}`);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(content.getAttribute("data-state")).toBe("closed");
      expect(content.hasAttribute("inert")).toBe(true);

      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(content.getAttribute("data-state")).toBe("open");
      expect(content.hasAttribute("inert")).toBe(false);
      expect(content.querySelectorAll("a[href]").length).toBeGreaterThan(0);
      expect(overlay().querySelector('[role="menu"]')).toBeNull();
      expect(router.url).toBe("/cases");
      expect(sidebar.state()).toBe("expanded");

      trigger.click();
      fixture.detectChanges();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(content.getAttribute("data-state")).toBe("closed");
    },
  );

  it.each([false, true])(
    "shows active children inline and closes mobile after selection (mobile: %s)",
    async (mobile) => {
      const { fixture, router, sidebar } = await render(
        "/finance/work-review",
        mobile,
        mobile,
      );
      const root = mobile ? overlay() : (fixture.nativeElement as HTMLElement);
      const trigger = root.querySelector<HTMLButtonElement>(
        'button[aria-label="nav.finance"]',
      );
      if (!trigger) throw new Error("Missing inline Finance trigger");
      const closeMobile = jest.spyOn(sidebar, "setOpenMobile");

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(trigger.getAttribute("data-active")).toBe("true");
      expect(
        root
          .querySelector('a[href="/finance/work-review"]')
          ?.getAttribute("aria-current"),
      ).toBe("page");
      expect(overlay().querySelector('[role="menu"]')).toBeNull();

      if (mobile) {
        trigger.click();
        fixture.detectChanges();
        trigger.click();
        fixture.detectChanges();
        expect(sidebar.openMobile()).toBe(true);
        expect(sidebar.state()).toBe("collapsed");
        expect(router.url).toBe("/finance/work-review");
      }

      root
        .querySelector<HTMLAnchorElement>('a[href="/finance/invoices"]')
        ?.click();
      await fixture.whenStable();
      expect(router.url).toBe("/finance/invoices");
      expect(closeMobile).toHaveBeenCalledWith(false);
      expect(sidebar.openMobile()).toBe(false);
    },
  );
});
