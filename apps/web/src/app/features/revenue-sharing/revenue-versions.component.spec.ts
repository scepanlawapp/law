import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { of, Subject, throwError } from "rxjs";
import { RevenueSharingApiClient } from "@law/api-clients";
import {
  defaultRevenueConfiguration,
  RevenueHistoryEntry,
} from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { RevenueVersionsComponent } from "./revenue-versions.component";
import { RevenueVersionDialogComponent } from "./revenue-version-dialog.component";
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
const page = { items: [entry], meta: { totalItems: 21 } };
describe("Revenue version list", () => {
  const api = { listVersions: jest.fn() };
  const closed = new Subject<boolean>();
  const dialogs = { open: jest.fn() };
  beforeEach(() => {
    api.listVersions.mockReset().mockReturnValue(of(page));
    dialogs.open.mockReset().mockReturnValue({ closed$: closed });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RevenueSharingApiClient, useValue: api },
        { provide: HlmDialogService, useValue: dialogs },
      ],
    });
  });
  it("requests each page from the server and resets the page when size changes", () => {
    const c = TestBed.runInInjectionContext(
      () => new RevenueVersionsComponent(),
    );
    c.changePage(2);
    expect(api.listVersions).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
    c.changePageSize(50);
    expect(api.listVersions).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 50,
    });
    expect(c.total()).toBe(21);
  });
  it("ignores a stale page response", () => {
    const first = new Subject<typeof page>();
    api.listVersions.mockReturnValueOnce(first);
    const c = TestBed.runInInjectionContext(
      () => new RevenueVersionsComponent(),
    );
    c.changePage(2);
    first.next({ items: [], meta: { totalItems: 0 } });
    expect(c.versions()).toEqual([entry]);
  });
  it("refreshes the first page only after successful dialog publication", () => {
    const c = TestBed.runInInjectionContext(
      () => new RevenueVersionsComponent(),
    );
    c.changePage(2);
    c.create();
    closed.next(true);
    expect(c.page()).toBe(1);
    expect(api.listVersions).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
    });
  });
  it("keeps the dialog open when unsaved navigation is rejected", async () => {
    const pending = {
      confirmLeave: jest.fn().mockResolvedValue(false),
      close: jest.fn(),
    };
    const c = TestBed.runInInjectionContext(
      () => new RevenueVersionsComponent(),
    );
    dialogs.open.mockImplementationOnce((_component, options) => {
      options.context.register(
        pending as unknown as RevenueVersionDialogComponent,
      );
      return { closed$: closed };
    });
    c.create();
    expect(await c.confirmLeave()).toBe(false);
    expect(pending.close).not.toHaveBeenCalled();
    pending.confirmLeave.mockResolvedValue(true);
    expect(await c.confirmLeave()).toBe(true);
    expect(pending.close).toHaveBeenCalled();
  });
  it("renders a real detail link and error recovery", () => {
    const fixture = TestBed.createComponent(RevenueVersionsComponent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector("tbody a").getAttribute("href"),
    ).toBe("/finance/settings/version-1");
    api.listVersions.mockReturnValue(throwError(() => new Error("offline")));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
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
