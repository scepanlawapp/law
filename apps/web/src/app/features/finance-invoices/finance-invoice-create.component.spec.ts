import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import {
  BillingSetupApiClient,
  ClientsApiClient,
  FinancialsApiClient,
  OrganizationSettingsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";
import { InvoiceLineImportDialogService } from "./invoice-line-import-dialog.service";
import { FinanceInvoiceCreateComponent } from "./finance-invoice-create.component";

const client = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};

function entry(id: string, treatment: WorkEntry["treatment"]): WorkEntry {
  return {
    id,
    user: { id: "user-1", displayName: "Ana Anić", email: null },
    client,
    case: null,
    workDate: "2026-09-10",
    minutes: 60,
    timerStartedAt: null,
    title: `Rad ${id}`,
    description: "",
    serviceCategory: null,
    treatment,
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    invoiceId: null,
    aiParsed: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
  };
}

describe("FinanceInvoiceCreateComponent with work entries", () => {
  const workEntries = { get: jest.fn() };
  const setup = { getProfile: jest.fn() };

  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's select primitives observe size.
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // no layout in jsdom
      }
      unobserve(): void {
        // no layout in jsdom
      }
      disconnect(): void {
        // no layout in jsdom
      }
    };
  });

  function create(): ComponentFixture<FinanceInvoiceCreateComponent> {
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    workEntries.get.mockImplementation((id: string) =>
      of(entry(id, id === "e1" ? "HOURLY" : "AT")),
    );
    setup.getProfile.mockReturnValue(
      of({ clientId: client.id, hourlyRate: "100.00", currency: "EUR" }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkEntriesApiClient, useValue: workEntries },
        { provide: BillingSetupApiClient, useValue: setup },
        { provide: FinancialsApiClient, useValue: {} },
        {
          provide: OrganizationSettingsApiClient,
          useValue: {
            get: () => of({ invoiceNumbering: { allowManualOverride: true } }),
          },
        },
        {
          provide: ClientsApiClient,
          useValue: {
            list: () =>
              of({
                items: [client],
                meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
              }),
          },
        },
        { provide: ClientFormDialogService, useValue: {} },
        { provide: InvoiceLineImportDialogService, useValue: {} },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({
                clientId: client.id,
                workEntryIds: ["e1", "e2"],
              }),
            },
          },
        },
      ],
    });
  });

  it("defaults the currency to the client's profile and prices HOURLY work", () => {
    const fixture = create();
    const component = fixture.componentInstance;

    expect(component.form.controls.currency.value).toBe("EUR");
    const [hourly, flagged] = component.form.controls.lines.controls;
    expect(hourly.controls.netAmount.value).toBe(100);
    expect(hourly.controls.pricingRequired.value).toBe(false);
    expect(flagged.controls.pricingRequired.value).toBe(true);
    expect(component.pricingRequiredCount()).toBe(1);
  });

  it("clears the flag when the user prices a flagged row", () => {
    const fixture = create();
    const flagged = fixture.componentInstance.form.controls.lines.at(1);

    flagged.controls.netAmount.setValue(250);
    fixture.detectChanges();

    expect(flagged.controls.pricingRequired.value).toBe(false);
    expect(fixture.componentInstance.pricingRequiredCount()).toBe(0);
  });

  it("hints at an unpriced, unflagged row", () => {
    const fixture = create();
    const lines = fixture.componentInstance.form.controls.lines;
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('[data-testid="price-required-hint"]'),
    ).toBeNull();

    lines.at(0).controls.netAmount.setValue(0);
    lines.at(0).controls.pricingRequired.setValue(false);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="price-required-hint"]'),
    ).toBeTruthy();
  });
});

describe("FinanceInvoiceCreateComponent editing a draft", () => {
  const feeLineId = "11111111-1111-4111-8111-111111111111";
  const invoiceId = "55555555-5555-4555-8555-555555555555";
  const user = { id: "user-1", displayName: "Ana Anić", email: null };
  const api = { invoice: jest.fn(), updateInvoice: jest.fn() };

  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // no layout in jsdom
      }
      unobserve(): void {
        // no layout in jsdom
      }
      disconnect(): void {
        // no layout in jsdom
      }
    };
  });

  function savedLine(id: string, lineOrder: number) {
    return {
      id,
      invoiceId,
      client,
      cases: [],
      performedBy: user,
      lineOrder,
      description: lineOrder === 0 ? "Paušal za septembar" : "Rad",
      serviceDate: "2026-09-30",
      netAmount: "1000.00",
      vatRate: "0.00",
      vatAmount: "0.00",
      grossAmount: "1000.00",
      currency: "RSD",
      status: "RESERVED" as const,
      sourceType: lineOrder === 0 ? "RETAINER_FEE" : null,
      sourceId: lineOrder === 0 ? "agreement-1" : null,
      pricingRequired: false,
      minutes: null,
      workEntries: [],
      billedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    api.invoice.mockReturnValue(
      of({
        id: invoiceId,
        clientId: client.id,
        status: "DRAFT",
        dateOfCreate: "2026-10-01",
        dateOfMaturity: "2026-10-15",
        dateOfTurnover: "2026-09-30",
        placeOfIssue: "Beograd",
        methodOfPayment: "Prenos",
        comment: "",
        vatRate: "0.00",
        numberOfCashBill: "",
        country: "Srbija",
        currency: "RSD",
        printWorkSpecification: true,
        lines: [savedLine(feeLineId, 0), savedLine("line-2", 1)],
      }),
    );
    api.updateInvoice.mockReturnValue(of({ id: invoiceId }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: "**", children: [] }]),
        { provide: WorkEntriesApiClient, useValue: {} },
        { provide: BillingSetupApiClient, useValue: { getProfile: jest.fn() } },
        { provide: FinancialsApiClient, useValue: api },
        {
          provide: OrganizationSettingsApiClient,
          useValue: {
            get: () => of({ invoiceNumbering: { allowManualOverride: true } }),
          },
        },
        {
          provide: ClientsApiClient,
          useValue: {
            list: () =>
              of({
                items: [client],
                meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
              }),
          },
        },
        { provide: ClientFormDialogService, useValue: {} },
        { provide: InvoiceLineImportDialogService, useValue: {} },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: invoiceId }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    });
  });

  it("keeps saved line ids on load and sends them on save; new lines have none", () => {
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const lines = component.form.controls.lines;

    expect(lines.controls.map((line) => line.controls.id.value)).toEqual([
      feeLineId,
      "line-2",
    ]);

    lines.at(0).patchValue({ description: "Korigovano", netAmount: 800 });
    component.addManualLine();
    lines.at(2).patchValue({ description: "Novi red", netAmount: 50 });
    component.submit();

    expect(api.updateInvoice).toHaveBeenCalledTimes(1);
    const sent = api.updateInvoice.mock.calls[0][1].lines;
    expect(sent.map((line: { id?: string }) => line.id)).toEqual([
      feeLineId,
      "line-2",
      undefined,
    ]);
    expect(sent[2]).not.toHaveProperty("id");
    expect(sent[0]).toMatchObject({
      description: "Korigovano",
      netAmount: 800,
    });
  });
});
