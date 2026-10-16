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

  async function render(route = "/cases", collapsed = false) {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(route);
    const sidebar = TestBed.inject(HlmSidebarService);
    sidebar.setOpen(!collapsed);
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
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
    const { fixture, router, sidebar } = await render("/finance/work-review");
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

  it("keeps owner-only report routes out of a member's menu", async () => {
    role.set(WorkspaceRole.MEMBER);
    const { fixture } = await render();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="nav.reports"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const links = Array.from(
      overlay().querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/reports/my-earnings",
    ]);
  });
});
