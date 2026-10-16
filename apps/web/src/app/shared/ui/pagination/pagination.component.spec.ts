import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { By } from "@angular/platform-browser";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import {
  HlmNumberedPagination,
  createPageArray,
  outOfBoundCorrection,
} from "@spartan-ng/helm/pagination";
import { BehaviorSubject, Subject, of } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { DEFAULT_PAGE_SIZE, PageState } from "../../pagination/paginated-list";
import { CasesListComponent } from "../../../features/cases/cases-list/cases-list.component";
import { ClientsComponent } from "../../../features/clients/clients.component";
import { ClientFormDialogService } from "../../../features/clients/client-create-edit-modal/client-form-dialog.service";
import { PaginationComponent } from "./pagination.component";

describe("PaginationComponent", () => {
  const language = signal("SR");
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
  });
  beforeEach(() => {
    language.set("SR");
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => `${language()}:${key}` },
        },
      ],
    });
  });

  function render(queryParams = false) {
    const onChange = jest.fn();
    const state = new PageState({ onChange });
    state.applyPage(1, { totalItems: 1101, totalPages: 12 });
    const fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput("paginator", state);
    fixture.componentRef.setInput("queryParams", queryParams);
    fixture.detectChanges();
    return { fixture, state, onChange };
  }

  it("renders totals, numbers, ellipsis and keyboard-focusable local controls", () => {
    const { fixture, state, onChange } = render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain("1101");
    expect(element.textContent).toContain("12");
    expect(element.querySelector("hlm-pagination-ellipsis")).not.toBeNull();
    const next = element.querySelector(
      '[aria-label="SR:pagination.next"]',
    ) as HTMLButtonElement;
    expect(next.tagName).toBe("BUTTON");
    next.click();
    fixture.detectChanges();
    expect(state.page()).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(
      element.querySelector('[aria-current="page"]')?.textContent?.trim(),
    ).toBe("2");
    const control = fixture.debugElement.query(
      By.directive(HlmNumberedPagination),
    ).componentInstance as HlmNumberedPagination;
    control.itemsPerPage.set(20);
    expect(state.pageSize()).toBe(20);
    expect(state.page()).toBe(1);
    language.set("EN");
    fixture.detectChanges();
    expect(element.textContent).toContain("EN:pagination.totalItems");
    expect(TestBed.inject(Router).url).toBe("/");
  });

  it("uses namespaced router links while preserving unrelated query parameters", async () => {
    const router = TestBed.inject(Router);
    await router.navigate([], {
      queryParams: { tab: "cases", casePageSize: 50 },
    });
    const { fixture } = render(true);
    fixture.componentRef.setInput("pageParam", "casePage");
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[aria-label="SR:pagination.page 2"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("casePage=2");
    expect(link.getAttribute("href")).toContain("tab=cases");
    expect(link.getAttribute("href")).toContain("casePageSize=50");
    const loading = signal(true);
    const busy = new PageState({ loading });
    busy.applyPage(1, { totalItems: 1101, totalPages: 12 });
    fixture.componentRef.setInput("paginator", busy);
    fixture.detectChanges();
    expect(
      fixture.nativeElement
        .querySelector("hlm-numbered-pagination-query-params")
        .hasAttribute("inert"),
    ).toBe(true);
  });

  it("does not emit page changes while computing links from stale or empty totals", () => {
    const { fixture, state, onChange } = render();
    state.page.set(12);
    state.applyPage(12, { totalItems: 0, totalPages: 0 });
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled();
    expect(outOfBoundCorrection(0, 50, 12)).toBe(1);
    expect(createPageArray(6, 50, 1000, 5)).toEqual([1, "...", 6, "...", 20]);
  });
});

describe("page-button list requests", () => {
  const meta = (page = 1, pageSize = DEFAULT_PAGE_SIZE, totalItems = 251) => ({
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  });

  it("clients uses the shared page size and resets size with one request", () => {
    jest.useFakeTimers();
    try {
      const api = {
        list: jest.fn((query) =>
          of({ items: [], meta: meta(query.page, query.pageSize) }),
        ),
      };
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: ClientsApiClient, useValue: api },
          { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
          { provide: ClientFormDialogService, useValue: {} },
        ],
      });
      const component = TestBed.runInInjectionContext(
        () => new ClientsComponent(),
      );
      jest.advanceTimersByTime(300);
      expect(api.list).toHaveBeenLastCalledWith({
        search: "",
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      component.list.changePage(3);
      component.list.changePageSize(20);
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(component.list.page()).toBe(1);
      expect(component.list.pageSize()).toBe(20);
      expect(component.list.totalItems()).toBe(251);
      component.search.setValue("Ana");
      jest.advanceTimersByTime(300);
      expect(api.list).toHaveBeenLastCalledWith({
        search: "Ana",
        page: 1,
        pageSize: 20,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("cases reads URL size, ignores unrelated query changes, and drops stale responses", () => {
    const params = new BehaviorSubject(
      convertToParamMap({ casePage: "2", casePageSize: "50", tab: "cases" }),
    );
    const first = new Subject<unknown>();
    const second = new Subject<unknown>();
    const api = {
      list: jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    };
    const navigate = jest.fn(() => Promise.resolve(true));
    const lookups = { list: jest.fn(() => of({ items: [] })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: CasesApiClient, useValue: api },
        { provide: ClientsApiClient, useValue: lookups },
        { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    const fixture = TestBed.createComponent(CasesListComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 50 }),
    );
    params.next(
      convertToParamMap({ casePage: "2", casePageSize: "50", tab: "overview" }),
    );
    expect(api.list).toHaveBeenCalledTimes(1);
    params.next(convertToParamMap({ casePage: "1", casePageSize: "20" }));
    second.next({ items: [], meta: meta(1, 20, 55) });
    second.complete();
    first.next({ items: [{ id: "stale" }], meta: meta(2) });
    expect(component.list.items()).toEqual([]);
    expect(component.list.page()).toBe(1);
    expect(component.list.totalItems()).toBe(55);
    component.list.changePageSize(100);
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          casePage: 1,
          casePageSize: 100,
        }),
        queryParamsHandling: "merge",
      }),
    );
    expect(lookups.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  });
});
