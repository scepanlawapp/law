import { PriceCatalogDialogService } from "../../finance-price-sources/price-catalog-dialog.service";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import {
  BillingReportsApiClient,
  BillingSetupApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import {
  PriceSourceScope,
  PriceSourceSummary,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, Subject, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ClientRateDialogService } from "../client-retainer-card/client-rate-dialog.service";
import { RetainerAgreementDialogService } from "../client-retainer-card/retainer-agreement-dialog.service";
import { ClientBillingSectionComponent } from "./client-billing-section.component";

const source = (
  id: string,
  scope: PriceSourceScope,
  clientId: string | null = null,
  caseId: string | null = null,
): PriceSourceSummary => ({
  id,
  scope,
  clientId,
  caseId,
  title: `Title ${id}`,
  workspaceId: "workspace",
  sourceUrl: null,
  documentId: null,
  createdByUserId: "user",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  versions: [],
});

describe("ClientBillingSectionComponent", () => {
  const viewer = { open: jest.fn(() => of(false)) };
  const role = signal(WorkspaceRole.OWNER);
  const api = { priceSources: jest.fn() };
  const setup = {
    listRetainers: jest.fn(() => of([])),
    getProfile: jest.fn(() => of(null)),
    getWorkspaceConfig: jest.fn(() => of({ internalCurrency: "RSD" })),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    role.set(WorkspaceRole.OWNER);
    api.priceSources.mockReturnValue(
      of([
        source("public", "WORKSPACE_PUBLIC_REFERENCE"),
        source("office", "COMPANY_CATALOG"),
        source("client", "CLIENT_AGREEMENT", "client-1"),
        source("case", "CASE_OVERRIDE", "client-1", "case-1"),
        source("other", "CLIENT_AGREEMENT", "client-2"),
        source("other-case", "CASE_OVERRIDE", "client-2", "case-2"),
      ]),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PriceCatalogDialogService, useValue: viewer },
        { provide: FinancialsApiClient, useValue: api },
        {
          provide: AuthState,
          useValue: { activeWorkspace: () => ({ role: role() }) },
        },
        { provide: BillingSetupApiClient, useValue: setup },
        {
          provide: BillingReportsApiClient,
          useValue: { clientUsage: () => of(null) },
        },
        {
          provide: RetainerAgreementDialogService,
          useValue: { open: () => of(null) },
        },
        {
          provide: ClientRateDialogService,
          useValue: { open: () => of(null) },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(ClientBillingSectionComponent);
    fixture.componentRef.setInput("clientId", "client-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it("lists this client's sources plus workspace references and links to their exact records", async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    expect(
      component
        .groups()
        .flatMap((group) => group.sources.map((item) => item.id)),
    ).toEqual(["public", "office", "client", "case"]);
    expect(component.generalReference()?.scope).toBe("CLIENT_AGREEMENT");
    expect(fixture.nativeElement.textContent).not.toContain("Title other");
    const button = fixture.nativeElement.querySelector(
      'button[aria-label="finance.viewCatalog: Title case"]',
    ) as HTMLButtonElement;
    button.click();
    expect(viewer.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "case" }),
    );
  });
  it("offers client creation with the client preselected when only office prices exist", async () => {
    api.priceSources.mockReturnValue(of([source("office", "COMPANY_CATALOG")]));
    const fixture = await create();
    expect(fixture.componentInstance.generalReference()?.scope).toBe(
      "COMPANY_CATALOG",
    );
    const link = fixture.nativeElement.querySelector(
      '[data-testid="create-client-prices"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("scope=CLIENT_AGREEMENT");
    expect(link.getAttribute("href")).toContain("clientId=client-1");
    expect(fixture.componentInstance.createQuery("CASE_OVERRIDE")).toEqual({
      scope: "CASE_OVERRIDE",
      clientId: "client-1",
    });
  });
  it("shows an honest empty state instead of inventing an office or public tariff", async () => {
    api.priceSources.mockReturnValue(of([]));
    const fixture = await create();
    expect(fixture.componentInstance.generalReference()).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="client-pricing-basis"]',
      ).textContent,
    ).toContain("clients.pricing.none");
  });
  it("shows a retryable failure without hiding the retainer card or claiming no sources exist", async () => {
    api.priceSources.mockReturnValueOnce(
      throwError(() => new Error("offline")),
    );
    const fixture = await create();
    expect(
      fixture.nativeElement.querySelector('[data-testid="retainer-card"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="client-pricing-basis"]',
      ),
    ).toBeNull();
    expect(fixture.componentInstance.error()).toBe(true);
    fixture.componentInstance.retry();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe(false);
    expect(
      fixture.componentInstance.groups().flatMap((group) => group.sources),
    ).toHaveLength(4);
  });
  it("ignores a stale request when switching clients", async () => {
    const pending = new Subject<PriceSourceSummary[]>();
    api.priceSources.mockReturnValueOnce(pending);
    const fixture = await create();
    fixture.componentRef.setInput("clientId", "client-2");
    fixture.detectChanges();
    await fixture.whenStable();
    pending.next([source("stale", "CLIENT_AGREEMENT", "client-2")]);
    expect(
      fixture.componentInstance
        .groups()
        .flatMap((group) => group.sources.map((item) => item.id)),
    ).toEqual(["public", "office", "other", "other-case"]);
  });
  it("preserves lawyer retainer access without requesting manager-only price sources", async () => {
    role.set(WorkspaceRole.LAWYER);
    const fixture = await create();
    expect(api.priceSources).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="retainer-card"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="client-price-sources"]',
      ),
    ).toBeNull();
  });
  it("hides billing and sends no requests for members", async () => {
    role.set(WorkspaceRole.MEMBER);
    const fixture = await create();
    expect(api.priceSources).not.toHaveBeenCalled();
    expect(setup.listRetainers).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent.trim()).toBe("");
  });
});
