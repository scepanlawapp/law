import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { NgIcon } from "@ng-icons/core";
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

const organizationSettings = {
  company: { city: "Novi Sad", countryCode: "RS" },
  tax: {
    defaultVatRate: 20,
    cashAccountingEnabled: false,
  },
  invoiceNumbering: { allowManualOverride: true },
  payment: {
    defaultPaymentTermDays: 15,
    defaultPaymentMethod: "BANK_TRANSFER",
  },
  currency: { defaultCurrencyCode: "RSD" },
  invoiceDefaults: {
    defaultIssuePlace: "Beograd",
    defaultNote: "Plaćanje u roku dospeća.",
  },
};
const importDialog = { open: jest.fn() };

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
  const financials = {
    suggestInvoiceNumber: jest.fn(() => of({ invoiceNumber: "2026-000001" })),
  };

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
    importDialog.open.mockReturnValue(of(undefined));
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
        { provide: FinancialsApiClient, useValue: financials },
        {
          provide: OrganizationSettingsApiClient,
          useValue: {
            get: () => of(organizationSettings),
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
        { provide: InvoiceLineImportDialogService, useValue: importDialog },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string, params?: { count?: number }) => {
              if (key === "settings.organization.payment.methods.BANK_TRANSFER")
                return "Virman";
              if (key === "finance.linkedWorkDetailsCount")
                return `Linked ${params?.count ?? ""}`;
              return key;
            },
            language: () => "SR",
          },
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
    expect(
      component.form.controls.lines.controls.map(
        (line) => line.controls.workEntryIds.value,
      ),
    ).toEqual([["e1"], ["e2"]]);
    const [hourly, flagged] = component.form.controls.lines.controls;
    expect(hourly.controls.netAmount.value).toBe(100);
    expect(hourly.controls.vatRate.value).toBe(20);
    expect(hourly.controls.vatAmount.value).toBe(20);
    expect(hourly.controls.grossAmount.value).toBe(120);
    expect(hourly.controls.pricingRequired.value).toBe(false);
    expect(flagged.controls.pricingRequired.value).toBe(true);
    expect(component.pricingRequiredCount()).toBe(1);
  });

  it("shows the linked-work count and toggles its accessible details", () => {
    const fixture = create();
    const button = fixture.nativeElement.querySelector(
      'button[aria-controls="invoice-line-work-0"]',
    ) as HTMLButtonElement;
    const icon = () =>
      fixture.debugElement.query(
        By.css("button[aria-controls='invoice-line-work-0'] ng-icon"),
      ).componentInstance as NgIcon;

    expect(button.textContent).toContain("Linked 1");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("invoice-line-work-0");
    expect(button.disabled).toBe(false);
    expect(icon().name()).toBe("lucideChevronDown");

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(icon().name()).toBe("lucideChevronUp");
    expect(
      fixture.nativeElement.querySelector("#invoice-line-work-0"),
    ).not.toBeNull();
  });

  it("prefills the invoice header from organization settings", () => {
    const component = create().componentInstance;

    expect(component.form.controls.placeOfIssue.value).toBe("Beograd");
    expect(component.form.controls.methodOfPayment.value).toBe("Virman");
    expect(component.form.controls.country.value).toBe("RS");
    expect(component.form.controls.comment.value).toBe(
      "Plaćanje u roku dospeća.",
    );
    expect(component.form.controls.vatRate.value).toBe(20);
    expect(component.form.controls.vatLiabilityTimingCode.value).toBe("35");
    expect(component.form.controls.dateOfMaturity.value).toBe(
      addDaysForTest(component.form.controls.dateOfCreate.value, 15),
    );
  });

  it("automatically suggests the invoice number for a new invoice", () => {
    const component = create().componentInstance;

    expect(financials.suggestInvoiceNumber).toHaveBeenCalledWith(
      component.form.controls.dateOfCreate.value,
    );
    expect(component.form.controls.invoiceNumber.value).toBe("2026-000001");
  });

  it("keeps billable deep-link work and reports requested non-billable work", () => {
    workEntries.get.mockImplementation((id: string) =>
      of(entry(id, id === "e1" ? "NON_BILLABLE" : "HOURLY")),
    );
    const component = create().componentInstance;

    expect(component.form.controls.lines.length).toBe(1);
    expect(
      component.form.controls.lines.at(0).controls.workEntryIds.value,
    ).toEqual(["e2"]);
    expect(component.saveError()).toBe("finance.someWorkUnavailable");
  });

  it("imports UNDECIDED deep-link work without inferring a price", () => {
    workEntries.get.mockImplementation((id: string) =>
      of(entry(id, "UNDECIDED")),
    );
    const component = create().componentInstance;

    expect(
      component.form.controls.lines.controls.map((line) => ({
        workEntryIds: line.controls.workEntryIds.value,
        netAmount: line.controls.netAmount.value,
        pricingRequired: line.controls.pricingRequired.value,
      })),
    ).toEqual([
      { workEntryIds: ["e1"], netAmount: 0, pricingRequired: true },
      { workEntryIds: ["e2"], netAmount: 0, pricingRequired: true },
    ]);
    expect(component.saveError()).toBe("");
  });

  it("clears the flag when the user prices a flagged row", () => {
    const fixture = create();
    const flagged = fixture.componentInstance.form.controls.lines.at(1);

    flagged.controls.netAmount.setValue(250);
    fixture.detectChanges();

    expect(flagged.controls.pricingRequired.value).toBe(false);
    expect(fixture.componentInstance.pricingRequiredCount()).toBe(0);
  });

  it("imports selected work as one deterministic grouped line", () => {
    const older = entry("group-older", "AT");
    older.workDate = "2026-09-08";
    older.title = "Prvi rad";
    older.value = "0.10";
    older.currency = "EUR";
    const newer = entry("group-newer", "AT");
    newer.workDate = "2026-09-09";
    newer.title = "Drugi rad";
    newer.value = "0.20";
    newer.currency = "EUR";
    importDialog.open.mockReturnValueOnce(
      of({ entries: [newer, older], mode: "GROUPED" }),
    );
    const component = create().componentInstance;

    component.openImportDialog();

    expect(importDialog.open).toHaveBeenCalledWith(client, ["e1", "e2"]);
    expect(component.form.controls.lines.length).toBe(3);
    expect(component.form.controls.lines.at(2).getRawValue()).toMatchObject({
      workEntryIds: ["group-older", "group-newer"],
      serviceDate: "2026-09-08",
      description: "Prvi rad; Drugi rad",
      netAmount: 0.3,
      pricingRequired: false,
      vatRate: 20,
    });
  });

  it("keeps selected entries separate and detaches associations on client change", () => {
    importDialog.open.mockReturnValueOnce(
      of({ entries: [entry("separate-entry", "AT")], mode: "SEPARATE" }),
    );
    const component = create().componentInstance;
    component.openImportDialog();
    expect(
      component.form.controls.lines.at(2).controls.workEntryIds.value,
    ).toEqual(["separate-entry"]);

    const originalNet =
      component.form.controls.lines.at(0).controls.netAmount.value;
    component.form.controls.clientId.setValue("client-2");

    expect(
      component.form.controls.lines.controls.every(
        (line) => line.controls.workEntryIds.value.length === 0,
      ),
    ).toBe(true);
    expect(component.form.controls.lines.at(0).controls.netAmount.value).toBe(
      originalNet,
    );
    expect(component.clientChangeNotice()).toBe(
      "finance.workDetachedOnClientChange",
    );
  });
});

describe("FinanceInvoiceCreateComponent editing a draft", () => {
  const feeLineId = "11111111-1111-4111-8111-111111111111";
  const invoiceId = "55555555-5555-4555-8555-555555555555";
  const user = { id: "user-1", displayName: "Ana Anić", email: null };
  const api = {
    invoice: jest.fn(),
    updateInvoice: jest.fn(),
    suggestInvoiceNumber: jest.fn(),
  };

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

  function draftInvoice(lines: unknown[]) {
    return {
      id: invoiceId,
      invoiceNumber: "2026-000042",
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
      lines,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    api.invoice.mockReturnValue(
      of({
        id: invoiceId,
        invoiceNumber: "2026-000042",
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
            get: () => of(organizationSettings),
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
        { provide: InvoiceLineImportDialogService, useValue: importDialog },
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

  it("preserves saved header and line VAT values while filling missing headers", () => {
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const firstLine = component.form.controls.lines.at(0);

    expect(component.form.controls.placeOfIssue.value).toBe("Beograd");
    expect(component.form.controls.methodOfPayment.value).toBe("Prenos");
    expect(component.form.controls.country.value).toBe("Srbija");
    expect(component.form.controls.comment.value).toBe(
      "Plaćanje u roku dospeća.",
    );
    expect(component.form.controls.vatLiabilityTimingCode.value).toBe("35");
    expect(firstLine.controls.vatRate.value).toBe(0);
    expect(firstLine.controls.vatAmount.value).toBe(0);
    expect(firstLine.controls.grossAmount.value).toBe(1000);
    expect(component.form.controls.invoiceNumber.value).toBe("2026-000042");
    expect(api.suggestInvoiceNumber).not.toHaveBeenCalled();
  });

  it("hydrates unique linked-work details and the comparable draft summary", () => {
    const detail = {
      id: "linked-work-1",
      workDate: "2026-09-30",
      user,
      title: "Pregled podneska",
      description: "",
      minutes: 75,
      case: { id: "case-1", caseNumber: "P-1/26", name: "Spor" },
      treatment: "HOURLY" as const,
      value: "0.10",
      currency: "RSD",
    };
    api.invoice.mockReturnValueOnce(
      of(draftInvoice([{ ...savedLine("line-2", 1), workEntries: [detail] }])),
    );
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.workEntryDetail(detail.id)).toMatchObject({
      title: "Pregled podneska",
      case: detail.case,
      treatment: "HOURLY",
      value: "0.10",
      currency: "RSD",
    });
    expect(component.linkedWorkSummary()).toMatchObject({
      count: 1,
      totalMinutes: 75,
      linkedLineCount: 1,
      valueTotal: "0.10",
      valueCurrency: "RSD",
      missingValue: false,
      mixedCurrencies: false,
    });
    const detailButton = fixture.nativeElement.querySelector(
      '[aria-controls="invoice-line-work-0"]',
    ) as HTMLButtonElement;
    expect(detailButton.getAttribute("aria-expanded")).toBe("false");
    detailButton.click();
    fixture.detectChanges();
    expect(detailButton.getAttribute("aria-expanded")).toBe("true");
    expect(fixture.nativeElement.textContent).toContain("Pregled podneska");
  });

  it("reports mixed currencies even when a linked WorkEntry has no value", () => {
    const workWithValue = {
      id: "work-rsd",
      workDate: "2026-09-29",
      user,
      title: "Rad u dinarima",
      description: "",
      minutes: 30,
      treatment: "AT" as const,
      value: "10.00",
      currency: "RSD",
    };
    const workWithoutValue = {
      ...workWithValue,
      id: "work-eur",
      title: "Rad u evrima bez vrednosti",
      value: null,
      currency: "EUR",
    };
    api.invoice.mockReturnValueOnce(
      of(
        draftInvoice([
          {
            ...savedLine("line-2", 1),
            workEntries: [workWithValue, workWithoutValue],
          },
        ]),
      ),
    );
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.linkedWorkSummary()).toMatchObject({
      count: 2,
      valueTotal: null,
      missingValue: true,
      mixedCurrencies: true,
    });
  });

  it("keeps line pricing when unlinking and immediately removes linked lines", () => {
    const detail = {
      id: "linked-work-2",
      workDate: "2026-09-30",
      user,
      title: "Pregled podneska",
      description: "",
      minutes: 45,
    };
    const remainingDetail = {
      ...detail,
      id: "linked-work-3",
      title: "Prateći rad",
      minutes: 30,
    };
    api.invoice.mockReturnValueOnce(
      of(
        draftInvoice([
          {
            ...savedLine("line-2", 1),
            minutes: 75,
            workEntries: [detail, remainingDetail],
          },
        ]),
      ),
    );
    const fixture = TestBed.createComponent(FinanceInvoiceCreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const line = component.form.controls.lines.at(0);
    const originalNet = line.controls.netAmount.value;

    component.unlinkWorkEntry(line, detail.id);
    expect(line.controls.workEntryIds.value).toEqual([remainingDetail.id]);
    expect(line.controls.minutes.value).toBe(30);
    expect(line.controls.netAmount.value).toBe(originalNet);
    expect(component.linkedWorkSummary().count).toBe(1);

    component.unlinkWorkEntry(line, remainingDetail.id);
    expect(line.controls.workEntryIds.value).toEqual([]);
    expect(line.controls.minutes.value).toBeNull();
    expect(component.linkedWorkSummary().count).toBe(0);

    line.controls.workEntryIds.setValue([detail.id]);
    component.formRevision.update((revision) => revision + 1);
    expect(component.form.controls.lines.length).toBe(1);
    expect(component.linkedWorkSummary().count).toBe(1);

    component.removeLine(0);
    expect(component.form.controls.lines.length).toBe(0);
    expect(component.linkedWorkSummary().count).toBe(0);
  });
});

function addDaysForTest(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}
