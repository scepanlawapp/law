import { PriceCatalogDialogService } from "./price-catalog-dialog.service";
import { PriceCatalogDeleteService } from "./price-catalog-delete.service";
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
  const deletion = { remove: jest.fn(() => of(true)) };
  const viewer = { open: jest.fn(() => of(false)) };
  const route = { snapshot: { queryParamMap: { get: jest.fn() } } };
  const casesApi = { list: jest.fn() };
  const financials = {
    priceSources: jest.fn(),
    createPriceSource: jest.fn(),
    appendPriceSourceVersion: jest.fn(),
    priceSourceVersions: jest.fn(),
  };
  const clientsApi = {
    list: jest.fn(() => of({ items: [] })),
    get: jest.fn(() =>
      of({ id: "linked-client", displayName: "Linked client" }),
    ),
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
        { provide: PriceCatalogDialogService, useValue: viewer },
        { provide: PriceCatalogDeleteService, useValue: deletion },
        { provide: ActivatedRoute, useValue: route },
        {
          provide: ClientsApiClient,
          useValue: clientsApi,
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
  const catalog = (id: string, selectedCase: string | null = null) => ({
    id,
    scope: selectedCase ? "CASE_OVERRIDE" : "CLIENT_AGREEMENT",
    clientId: "client",
    caseId: selectedCase,
    title: id,
    createdAt: "2026-10-14",
    versions: [{ rawText: id }],
  });
  it("matches general client and each case separately, and permits another case catalog", () => {
    component.sources.set([
      catalog("general"),
      catalog("specific", "case-a"),
    ] as never);
    component.setClientId("client");
    expect(component.selectedSource()?.id).toBe("general");
    component.setCaseId("case-a");
    expect(component.selectedSource()?.id).toBe("specific");
    component.setCaseId("case-b");
    expect(component.selectedSource()).toBeNull();
    expect(component.form.controls.clientId.value).toBe("client");
    component.form.patchValue({ title: "Case B", rawText: "300 EUR" });
    component.save();
    expect(financials.createPriceSource).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client", caseId: "case-b" }),
    );
    expect(component.filterClientId()).toBe("client");
    expect(component.filterCaseId()).toBe("case-b");
    expect(component.form.controls.caseId.value).toBe("case-b");
  });
  it("selects a case without first selecting a client and supports clearing just the case or all filters", () => {
    component.directoryCases.set([
      {
        id: "case-a",
        name: "Case A",
        caseNumber: "1",
        client: { id: "client", displayName: "Client" },
      },
      { id: "case-b", client: { id: "other" } },
    ] as never);
    component.sources.set([
      catalog("general"),
      catalog("specific", "case-a"),
    ] as never);
    component.setFilter("case:case-a");
    expect(component.filterClientId()).toBe("client");
    expect(component.form.controls.clientId.value).toBe("client");
    expect(component.form.controls.caseId.value).toBe("case-a");
    expect(component.visibleSources().map((source) => source.id)).toEqual([
      "specific",
    ]);
    expect(component.filterCases().map((item) => item.id)).toEqual(["case-a"]);
    component.setFilter("client:client");
    expect(component.filterCaseId()).toBe("");
    expect(component.visibleSources()).toHaveLength(2);
    expect(component.selectedSource()?.id).toBe("general");
    component.setFilter("");
    expect(component.filterClientId()).toBe("");
    expect(component.filterCases()).toHaveLength(2);
  });
  it("infers the client when choosing a case directly in the editor", () => {
    component.cases.set([{ id: "case", client: { id: "client" } }] as never);
    component.setCaseId("case");
    expect(component.form.controls.clientId.value).toBe("client");
    expect(component.form.controls.caseId.value).toBe("case");
  });
  it("does not allow selecting another clients case while the filter is scoped", () => {
    component.directoryCases.set([
      { id: "case", client: { id: "other" } },
    ] as never);
    component.setFilter("client:client");
    component.setFilter("case:case");
    expect(component.filterClientId()).toBe("client");
    expect(component.filterCaseId()).toBe("");
  });
  it("ignores client and case list filters in workspace catalog tabs", () => {
    component.filterClientId.set("client");
    component.filterCaseId.set("case");
    component.sources.set([
      { id: "office", scope: "COMPANY_CATALOG" },
    ] as never);
    component.selectTab("COMPANY_CATALOG");
    expect(component.visibleSources().map((item) => item.id)).toEqual([
      "office",
    ]);
  });
  it("clears the selected catalog and content for a new catalog", () => {
    component.selectSource({
      id: "catalog",
      versions: [],
      title: "Old",
    } as never);
    component.form.controls.rawText.setValue("Old prices");
    component.create();
    expect(component.selectedSource()).toBeNull();
    expect(component.form.controls.title.value).toBe("");
    expect(component.form.controls.rawText.value).toBe("");
  });
  it("refreshes and clears a deleted selected catalog", () => {
    const source = { id: "catalog", versions: [], title: "Old" } as never;
    component.selectSource(source);
    component.remove(source);
    expect(deletion.remove).toHaveBeenCalledWith(source);
    expect(component.selectedSource()).toBeNull();
    expect(financials.priceSources).toHaveBeenCalledTimes(2);
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
  it("prefills the linked client even when it is outside the first client page", () => {
    route.snapshot.queryParamMap.get.mockImplementation(
      (key: string) =>
        ({ clientId: "linked-client", scope: "CLIENT_AGREEMENT" })[key],
    );
    const linked = TestBed.runInInjectionContext(
      () => new FinancePriceSourcesComponent(),
    );
    expect(linked.form.controls.clientId.value).toBe("linked-client");
    expect(linked.form.controls.caseId.value).toBe("");
    expect(linked.clientName("linked-client")).toBe("Linked client");
    expect(clientsApi.get).toHaveBeenCalledWith("linked-client");
    linked.sources.set([
      { id: "one", scope: "CLIENT_AGREEMENT", clientId: "linked-client" },
      {
        id: "two",
        scope: "CASE_OVERRIDE",
        clientId: "linked-client",
        caseId: "case",
      },
      { id: "other", scope: "CLIENT_AGREEMENT", clientId: "other-client" },
    ] as never);
    expect(linked.visibleSources().map((item) => item.id)).toEqual([
      "one",
      "two",
    ]);
    linked.form.patchValue({ title: "Client prices", rawText: "100 EUR" });
    linked.save();
    expect(financials.createPriceSource).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "CLIENT_AGREEMENT",
        clientId: "linked-client",
        caseId: undefined,
      }),
    );
    expect(linked.form.controls.clientId.value).toBe("linked-client");
  });

  it("requires a case when creating a case-specific source from the client card", () => {
    route.snapshot.queryParamMap.get.mockImplementation(
      (key: string) =>
        ({ clientId: "linked-client", scope: "CASE_OVERRIDE" })[key],
    );
    const linked = TestBed.runInInjectionContext(
      () => new FinancePriceSourcesComponent(),
    );
    linked.form.patchValue({ title: "Case prices", rawText: "100 EUR" });
    linked.save();
    expect(financials.createPriceSource).not.toHaveBeenCalled();
    expect(linked.form.controls.caseId.hasError("required")).toBe(true);
    linked.setCaseId("case");
    linked.save();
    expect(financials.createPriceSource).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "CASE_OVERRIDE",
        clientId: "linked-client",
        caseId: "case",
      }),
    );
  });

  it.each(["COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"])(
    "opens the requested workspace category %s without associating it with a client",
    (scope) => {
      route.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => ({ clientId: "linked-client", scope })[key],
      );
      const linked = TestBed.runInInjectionContext(
        () => new FinancePriceSourcesComponent(),
      );
      expect(linked.tab()).toBe(scope);
      expect(linked.form.controls.clientId.value).toBe("");
      linked.form.patchValue({ title: "Prices", rawText: "100 EUR" });
      linked.save();
      expect(financials.createPriceSource).toHaveBeenCalledWith(
        expect.objectContaining({
          scope,
          clientId: undefined,
          caseId: undefined,
        }),
      );
    },
  );
});
