import { ActivatedRoute } from "@angular/router";
import { TestBed } from "@angular/core/testing";
import {
  ClientsApiClient,
  CasesApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import { of, Subject, throwError } from "rxjs";
import { FinancePriceSourcesComponent } from "./finance-price-sources.component";
import { LocalizationService } from "../../core/localization/localization.service";

const page = (ids: string[], next = false, number = 1) => ({
  items: ids.map((id) => ({ id, name: id, caseNumber: id })),
  meta: { page: number, hasNextPage: next },
});
describe("price source case selection", () => {
  let component: FinancePriceSourcesComponent;
  const route = { snapshot: { queryParamMap: { get: jest.fn() } } };
  const casesApi = { list: jest.fn() };
  const financials = {
    priceSources: jest.fn(),
    createPriceSource: jest.fn(),
    appendPriceSourceVersion: jest.fn(),
    priceSourceVersions: jest.fn(),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    route.snapshot.queryParamMap.get.mockReturnValue(null);
    casesApi.list.mockReturnValue(of(page([])));
    financials.priceSources.mockReturnValue(of([]));
    financials.createPriceSource.mockReturnValue(of({}));
    financials.appendPriceSourceVersion.mockReturnValue(of({}));
    financials.priceSourceVersions.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: route },
        {
          provide: ClientsApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        { provide: CasesApiClient, useValue: casesApi },
        { provide: FinancialsApiClient, useValue: financials },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    component = TestBed.runInInjectionContext(
      () => new FinancePriceSourcesComponent(),
    );
  });
  it("opens the source named by a link in its matching tab", () => {
    const source = {
      id: "source-1",
      scope: "COMPANY_CATALOG",
      title: "Office prices",
      versions: [{ rawText: "1000 RSD" }],
    };
    route.snapshot.queryParamMap.get.mockReturnValue("source-1");
    financials.priceSources.mockReturnValue(of([source]));
    component.load();
    expect(component.tab()).toBe("COMPANY_CATALOG");
    expect(component.selectedSource()?.id).toBe("source-1");
    expect(component.form.controls.rawText.value).toBe("1000 RSD");
  });

  it("loads every page of the selected clients cases", () => {
    casesApi.list
      .mockReturnValueOnce(of(page(["a"], true)))
      .mockReturnValueOnce(of(page(["b"], false, 2)));
    component.setClientId("client");
    expect(component.cases().map((c) => c.id)).toEqual(["a", "b"]);
    expect(casesApi.list).toHaveBeenLastCalledWith({
      clientId: "client",
      page: 2,
      pageSize: 100,
    });
    expect(component.caseItemToString("b")).toBe("b · b");
    expect(component.caseItemToString("")).toBe("finance.allCases");
  });
  it("cancels stale case loads and clears selected case when client changes", () => {
    const old = new Subject<ReturnType<typeof page>>();
    casesApi.list
      .mockReturnValueOnce(old)
      .mockReturnValueOnce(of(page(["new"])));
    component.setClientId("old-client");
    component.setCaseId("old-case");
    component.setClientId("new-client");
    old.next(page(["stale"]));
    old.complete();
    expect(component.form.controls.caseId.value).toBe("");
    expect(component.cases().map((c) => c.id)).toEqual(["new"]);
  });
  it.each([
    ["", "CLIENT_AGREEMENT"],
    ["case", "CASE_OVERRIDE"],
  ])("saves case %s as %s", (caseId, scope) => {
    component.setClientId("client");
    component.form.patchValue({ title: "Cena", rawText: "1000 RSD", caseId });
    component.save();
    expect(financials.createPriceSource).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client",
        caseId: caseId || undefined,
        scope,
      }),
    );
  });
  it("shows case overrides in client agreements and retains association when appending a version", () => {
    const source = {
      id: "s",
      scope: "CASE_OVERRIDE",
      clientId: "client",
      caseId: "case",
      title: "Cena",
      versions: [{ rawText: "1000" }],
    } as never;
    component.sources.set([source]);
    expect(component.visibleSources()).toEqual([source]);
    component.selectSource(source);
    expect(component.form.controls.caseId.value).toBe("case");
    component.form.controls.rawText.setValue("2000");
    component.save();
    expect(financials.appendPriceSourceVersion).toHaveBeenCalledWith(
      "s",
      "2000",
    );
    expect(financials.createPriceSource).not.toHaveBeenCalled();
  });
  it("blocks create after failed case loading and recovers with retry", () => {
    casesApi.list
      .mockReturnValueOnce(throwError(() => new Error("offline")))
      .mockReturnValueOnce(of(page(["case"])));
    component.setClientId("client");
    component.form.patchValue({ title: "Cena", rawText: "1000" });
    component.save();
    expect(component.casesError()).toBe(true);
    expect(financials.createPriceSource).not.toHaveBeenCalled();
    component.retryCases();
    expect(component.casesError()).toBe(false);
    expect(component.cases()).toHaveLength(1);
  });
});
