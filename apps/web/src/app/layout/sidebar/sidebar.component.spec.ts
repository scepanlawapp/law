import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NavigationEnd, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { of, Subject } from "rxjs";
import { SidebarComponent } from "./sidebar.component";

describe("SidebarComponent", () => {
  const events = new Subject<NavigationEnd>();
  const router = { url: "/finance/work-review", events };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: AuthState,
          useValue: {
            session: signal(null),
            activeWorkspace: signal(null),
            logout: () => of(undefined),
          },
        },
      ],
    })
      .overrideComponent(SidebarComponent, { set: { template: "" } })
      .compileComponents();
  });

  it("keeps Finance expanded while a Finance route is active", () => {
    const fixture = TestBed.createComponent(SidebarComponent);

    expect(fixture.componentInstance.financeRouteActive()).toBe(true);

    events.next(new NavigationEnd(1, "/finance/invoices", "/finance/invoices"));
    expect(fixture.componentInstance.financeRouteActive()).toBe(true);

    events.next(new NavigationEnd(2, "/cases", "/cases"));
    expect(fixture.componentInstance.financeRouteActive()).toBe(false);
  });
});
