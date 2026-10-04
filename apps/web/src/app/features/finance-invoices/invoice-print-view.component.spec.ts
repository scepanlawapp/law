import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import {
  Invoice,
  InvoiceLineSummary,
} from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { InvoicePrintViewComponent } from "./invoice-print-view.component";

const client = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};
const ana = { id: "user-1", displayName: "Ana Anić", email: null };
const marko = { id: "user-2", displayName: "Marko Marković", email: null };

function line(
  id: string,
  workEntries: InvoiceLineSummary["workEntries"],
): InvoiceLineSummary {
  return {
    id,
    invoiceId: "invoice-1",
    client,
    cases: [],
    performedBy: ana,
    lineOrder: 0,
    description: `Stavka ${id}`,
    serviceDate: "2026-09-10",
    netAmount: "1000.00",
    vatRate: "20.00",
    vatAmount: "200.00",
    grossAmount: "1200.00",
    currency: "RSD",
    status: "RESERVED",
    sourceType: workEntries.length ? "WORK_ENTRY_GROUP" : null,
    sourceId: null,
    pricingRequired: false,
    minutes: null,
    workEntries,
    billedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  };
}

function invoice(printWorkSpecification: boolean): Invoice {
  return {
    id: "invoice-1",
    workspaceId: "workspace-1",
    clientId: client.id,
    invoiceNumber: "OBR-2026-001",
    dateOfCreate: "2026-10-01",
    dateOfMaturity: "2026-10-16",
    dateOfTurnover: "2026-09-30",
    placeOfIssue: "Beograd",
    methodOfPayment: "",
    comment: "",
    netAmount: "2000.00",
    vatRate: "20.00",
    vatAmount: "400.00",
    grossAmount: "2400.00",
    numberOfCashBill: "",
    country: "",
    currency: "RSD",
    status: "DRAFT",
    sharedAt: null,
    sharedMethod: null,
    externalInvoiceNumber: null,
    externalInvoiceDate: null,
    externalReference: null,
    voidedAt: null,
    voidReason: null,
    printWorkSpecification,
    billingMonth: "2026-09",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    client,
    lines: [
      line("a", [
        {
          id: "e2",
          workDate: "2026-09-20",
          user: marko,
          description: "Poziv sa klijentom",
          minutes: 30,
        },
        {
          id: "e1",
          workDate: "2026-09-05",
          user: ana,
          description: "Izrada ugovora",
          minutes: 90,
        },
      ]),
      line("b", [
        {
          id: "e3",
          workDate: "2026-09-12",
          user: ana,
          description: "Ročište",
          minutes: 60,
        },
      ]),
    ],
    total: "2400.00",
  };
}

describe("InvoicePrintViewComponent work specification", () => {
  const statements = { invoice: jest.fn() };
  const clients = { get: jest.fn(), listAddresses: jest.fn() };

  function create(
    printWorkSpecification: boolean,
  ): ComponentFixture<InvoicePrintViewComponent> {
    statements.invoice.mockReturnValue(of(invoice(printWorkSpecification)));
    const fixture = TestBed.createComponent(InvoicePrintViewComponent);
    fixture.detectChanges();
    return fixture;
  }

  const rows = (fixture: ComponentFixture<unknown>) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="work-specification-row"]',
      ),
    ).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) =>
        (cell.textContent ?? "").trim(),
      ),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    clients.get.mockReturnValue(of(null));
    clients.listAddresses.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FinancialsApiClient, useValue: statements },
        { provide: ClientsApiClient, useValue: clients },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: "invoice-1" }) },
          },
        },
      ],
    });
  });

  it("appends the specification of all line entries by date with a total", () => {
    const fixture = create(true);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain("finance.workSpecification");
    expect(rows(fixture)).toEqual([
      ["5. 9. 2026.", "Ana Anić", "Izrada ugovora", "1 h 30 min"],
      ["12. 9. 2026.", "Ana Anić", "Ročište", "1 h 0 min"],
      ["20. 9. 2026.", "Marko Marković", "Poziv sa klijentom", "0 h 30 min"],
    ]);
    expect(
      element
        .querySelector('[data-testid="work-specification-total"]')
        ?.textContent?.replace(/\s+/g, " "),
    ).toContain("3 h 0 min");
  });

  it("appends the specification after the totals and the closing row", () => {
    const element = create(true).nativeElement as HTMLElement;
    const spec = element.querySelector(
      '[data-testid="work-specification"]',
    ) as Element;

    for (const selector of [
      ".line-table",
      ".summary-grid",
      ".payment-card",
      ".closing-row",
    ]) {
      const before = element.querySelector(selector) as Element;
      expect(
        before.compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("prints no specification when the flag is off", () => {
    const fixture = create(false);
    const element = fixture.nativeElement as HTMLElement;

    expect(rows(fixture)).toEqual([]);
    expect(element.textContent).not.toContain("finance.workSpecification");
    expect(
      element.querySelector('[data-testid="work-specification"]'),
    ).toBeNull();
  });

  it("prints no specification for a invoice without entry-backed lines", () => {
    const manual = invoice(true);
    manual.lines = manual.lines.map((item) => ({ ...item, workEntries: [] }));
    statements.invoice.mockReturnValue(of(manual));
    const fixture = TestBed.createComponent(InvoicePrintViewComponent);
    fixture.detectChanges();

    expect(rows(fixture)).toEqual([]);
  });
});
