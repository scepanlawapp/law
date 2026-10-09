import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import {
  BillingReportsApiClient,
  BillingSetupApiClient,
  ClientsApiClient,
} from "@law/api-clients";
import {
  RetainerAgreement,
  RetainerUsage,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { RetainerAgreementDialogService } from "../clients/client-retainer-card/retainer-agreement-dialog.service";
import { FinanceRetainersComponent, sortByUsage } from "./retainers.component";

function usage(
  id: string,
  name: string,
  coveredMinutes: number,
  includedMinutes: number | null,
): RetainerUsage {
  return {
    client: {
      id,
      clientNumber: id,
      type: "COMPANY",
      displayName: name,
      status: "ACTIVE",
    },
    agreementId: `agreement-${id}`,
    month: "2026-10",
    currency: "RSD",
    fee: "100000.00",
    includedMinutes,
    coveredMinutes,
    outOfScopeMinutes: 0,
    effectiveHourlyRate: null,
    targetHourlyRate: null,
  };
}

describe("sortByUsage", () => {
  it("orders by usage descending with uncapped agreements last", () => {
    const rows = sortByUsage([
      usage("a", "Alfa", 300, 1200),
      usage("b", "Beta", 0, null),
      usage("c", "Gama", 1500, 1200),
      usage("d", "Delta", 960, 1200),
      usage("e", "Aca", 10, null),
    ]);

    expect(rows.map((row) => row.usage.client.displayName)).toEqual([
      "Gama",
      "Delta",
      "Alfa",
      "Aca",
      "Beta",
    ]);
    expect(rows.map((row) => row.state)).toEqual([
      "exceeded",
      "warning",
      "ok",
      "ok",
      "ok",
    ]);
  });
});

describe("FinanceRetainersComponent", () => {
  const role = signal<WorkspaceRole>(WorkspaceRole.OWNER);
  const api = { usage: jest.fn() };
  const setup = {
    getWorkspaceConfig: jest.fn(),
    listRetainers: jest.fn(),
  };
  const clientsApi = { list: jest.fn() };
  const agreementDialog = { open: jest.fn() };
  const savedAgreement: RetainerAgreement = {
    id: "agreement-1",
    clientId: "client-1",
    title: "Paušal 2026",
    monthlyFee: "100000.00",
    currency: "RSD",
    validFrom: "2026-01-01",
    validTo: null,
    includedMinutes: 1200,
    coveredCategoryIds: [],
    overageRule: "ABSORBED",
    overageHourlyRate: null,
    outOfScopeRule: "AT",
    outOfScopeHourlyRate: null,
    active: true,
  };

  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // jsdom has no layout.
      }
      unobserve(): void {
        // jsdom has no layout.
      }
      disconnect(): void {
        // jsdom has no layout.
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    role.set(WorkspaceRole.OWNER);
    setup.getWorkspaceConfig.mockReturnValue(
      of({
        targetHourlyRate: "8000.00",
        internalCurrency: "RSD",
        defaultVatRate: "20",
        paymentTermDays: 15,
      }),
    );
    clientsApi.list.mockReturnValue(
      of({
        items: [
          {
            id: "client-1",
            clientNumber: "K-1",
            type: "COMPANY",
            displayName: "Alfa",
            status: "ACTIVE",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    );
    agreementDialog.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthState,
          useValue: { activeWorkspace: () => ({ role: role() }) },
        },
        { provide: BillingReportsApiClient, useValue: api },
        { provide: BillingSetupApiClient, useValue: setup },
        { provide: ClientsApiClient, useValue: clientsApi },
        {
          provide: RetainerAgreementDialogService,
          useValue: agreementDialog,
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  async function create(): Promise<
    ComponentFixture<FinanceRetainersComponent>
  > {
    const fixture = TestBed.createComponent(FinanceRetainersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowNames = (fixture: ComponentFixture<unknown>) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="retainer-row"] a',
      ),
    ).map((link) => link.textContent?.trim());

  it("loads the current month and lists rows sorted by usage, linking to clients", async () => {
    api.usage.mockReturnValue(
      of([usage("a", "Alfa", 300, 1200), usage("c", "Gama", 1100, 1200)]),
    );
    const fixture = await create();

    expect(api.usage).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
    expect(rowNames(fixture)).toEqual(["Gama", "Alfa"]);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="retainer-row"] a')
        ?.getAttribute("href"),
    ).toBe("/clients/c");
  });

  const withRates = (currency: string): RetainerUsage => ({
    ...usage("a", "Alfa", 300, 1200),
    currency,
    effectiveHourlyRate: "6250.00",
    targetHourlyRate: "8000.00",
  });

  it("shows effective and target rate when currencies match", async () => {
    api.usage.mockReturnValue(of([withRates("RSD")]));
    const text = ((await create()).nativeElement as HTMLElement).textContent;

    expect(text).toContain("6.250");
    expect(text).toContain("8.000");
    expect(text).not.toContain("retainers.card.notComparable");
  });

  it("flags the target as not comparable when currencies differ", async () => {
    api.usage.mockReturnValue(of([withRates("EUR")]));
    const fixture = await create();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain("6.250");
    expect(text).not.toContain("8.000");
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="retainer-not-comparable"]',
      ),
    ).not.toBeNull();
  });

  it("does not load the workspace config for a lawyer", async () => {
    role.set(WorkspaceRole.LAWYER);
    api.usage.mockReturnValue(of([withRates("RSD")]));
    await create();

    expect(setup.getWorkspaceConfig).not.toHaveBeenCalled();
    expect(clientsApi.list).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-testid="retainer-create"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="retainer-edit-agreement"]'),
    ).toBeNull();
  });

  it("opens the create dialog for the selected client and refreshes usage after save", async () => {
    api.usage.mockReturnValue(of([]));
    agreementDialog.open.mockReturnValue(of(savedAgreement));
    const fixture = await create();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="retainer-create"]',
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(clientsApi.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      status: "ACTIVE",
    });

    fixture.componentInstance.selectedClient.setValue("client-1");
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();

    expect(agreementDialog.open).toHaveBeenCalledWith({
      clientId: "client-1",
      agreement: null,
    });
    expect(api.usage).toHaveBeenCalledTimes(2);
    expect(api.usage).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });

  it("does not refresh usage when the create dialog is dismissed", async () => {
    api.usage.mockReturnValue(of([]));
    agreementDialog.open.mockReturnValue(of(null));
    const fixture = await create();

    fixture.componentInstance.selectedClient.setValue("client-1");
    fixture.componentInstance.createAgreement();
    await fixture.whenStable();

    expect(api.usage).toHaveBeenCalledTimes(1);
  });

  it("loads and opens the selected row's full agreement, then refreshes after save", async () => {
    const rowUsage = {
      ...usage("client-1", "Alfa", 300, 1200),
      agreementId: savedAgreement.id,
    };
    api.usage.mockReturnValue(of([rowUsage]));
    setup.listRetainers.mockReturnValue(of([savedAgreement]));
    agreementDialog.open.mockReturnValue(of(savedAgreement));
    const fixture = await create();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="retainer-edit-agreement"]',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain("retainers.card.edit");
    button.click();
    await fixture.whenStable();

    expect(setup.listRetainers).toHaveBeenCalledWith("client-1");
    expect(agreementDialog.open).toHaveBeenCalledWith({
      clientId: "client-1",
      agreement: savedAgreement,
    });
    expect(api.usage).toHaveBeenCalledTimes(2);
    expect(api.usage).toHaveBeenLastCalledWith(
      fixture.componentInstance.month.value,
    );
  });

  it("does not refresh usage when an edit is dismissed", async () => {
    const rowUsage = {
      ...usage("client-1", "Alfa", 300, 1200),
      agreementId: savedAgreement.id,
    };
    api.usage.mockReturnValue(of([rowUsage]));
    setup.listRetainers.mockReturnValue(of([savedAgreement]));
    agreementDialog.open.mockReturnValue(of(null));
    const fixture = await create();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(
        '[data-testid="retainer-edit-agreement"]',
      )
      ?.click();
    await fixture.whenStable();

    expect(agreementDialog.open).toHaveBeenCalledWith({
      clientId: "client-1",
      agreement: savedAgreement,
    });
    expect(api.usage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing agreement", of([])],
    ["agreement lookup failure", throwError(() => new Error("failed"))],
  ])("shows a localized error for %s", async (_caseName, agreements) => {
    api.usage.mockReturnValue(
      of([
        {
          ...usage("client-1", "Alfa", 300, 1200),
          agreementId: savedAgreement.id,
        },
      ]),
    );
    setup.listRetainers.mockReturnValue(agreements);
    const fixture = await create();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(
        '[data-testid="retainer-edit-agreement"]',
      )
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')
        ?.textContent,
    ).toContain("retainers.list.editError");
    expect(agreementDialog.open).not.toHaveBeenCalled();
  });

  it("reloads when the month changes", async () => {
    api.usage.mockReturnValue(of([]));
    const fixture = await create();

    fixture.componentInstance.month.setValue("2026-09");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.usage).toHaveBeenLastCalledWith("2026-09");
  });

  it("shows an unavailable note instead of an error on 403", async () => {
    api.usage.mockReturnValue(throwError(() => ({ status: 403 })));
    const fixture = await create();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "retainers.list.unavailable",
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]'),
    ).toBeNull();
  });
});
