import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { of, throwError } from "rxjs";
import { RevenueSharingApiClient } from "@law/api-clients";
import {
  defaultRevenueConfiguration,
  RevenueHistoryEntry,
} from "@law/api-interfaces";
import { RevenueVersionsComponent } from "./revenue-versions.component";
import { RevenueVersionDetailComponent } from "./revenue-version-detail.component";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };
});

const entry: RevenueHistoryEntry = {
  id: "version-1",
  version: 1,
  effectiveFrom: "2026-10-12",
  createdAt: "2026-10-12T10:00:00Z",
  reason: "Initial",
  changedBy: "Ana",
  configuration: defaultRevenueConfiguration(),
};
describe("Revenue settings route", () => {
  it("renders the editor directly on the route instead of opening a version dialog", () => {
    const fixture = TestBed.createComponent(RevenueVersionsComponent);
    expect(
      fixture.nativeElement.querySelector("law-revenue-sharing"),
    ).not.toBeNull();
  });
});
describe("Revenue version details", () => {
  const api = {
    getVersion: jest.fn(),
    references: () => of({ members: [], clients: [], cases: [], events: [] }),
  };
  beforeEach(() => {
    api.getVersion.mockReset().mockReturnValue(of(entry));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RevenueSharingApiClient, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: entry.id })),
            snapshot: { paramMap: convertToParamMap({ id: entry.id }) },
          },
        },
      ],
    });
  });
  it("loads the requested immutable snapshot with a breadcrumb and no edit controls", () => {
    const fixture = TestBed.createComponent(RevenueVersionDetailComponent);
    fixture.detectChanges();
    expect(api.getVersion).toHaveBeenCalledWith(entry.id);
    expect(
      fixture.nativeElement.querySelector("nav a").getAttribute("href"),
    ).toBe("/finance/settings");
    expect(fixture.nativeElement.textContent).toContain("Initial");
    expect(fixture.nativeElement.querySelector("input")).toBeNull();
    expect(fixture.componentInstance.sections()[0].rows.length).toBeGreaterThan(
      15,
    );
  });
  it("shows a recoverable failure for unavailable versions", () => {
    api.getVersion.mockReturnValue(throwError(() => new Error("missing")));
    const fixture = TestBed.createComponent(RevenueVersionDetailComponent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
    api.getVersion.mockReturnValue(of(entry));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.componentInstance.version()).toEqual(entry);
  });
});
