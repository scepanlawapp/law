import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { FinancialsApiClient } from "@law/api-clients";
import { Invoice, WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { FinanceInvoiceDetailComponent } from "./finance-invoice-detail.component";

const client = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};
const user = { id: "user-1", displayName: "Ana Anić", email: null };

function invoice(pricingRequired: boolean): Invoice {
  return {
    id: "invoice-1",
    workspaceId: "workspace-1",
    clientId: client.id,
    invoiceNumber: "OBR-2026-001",
    dateOfCreate: "2026-10-01",
    dateOfMaturity: "2026-10-16",
    dateOfTurnover: "2026-09-30",
    placeOfIssue: "",
    methodOfPayment: "",
    comment: "",
    netAmount: "0.00",
    vatRate: "0.00",
    vatAmount: "0.00",
    grossAmount: "0.00",
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
    printWorkSpecification: true,
    billingMonth: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    client,
    lines: [
      {
        id: "line-1",
        invoiceId: "invoice-1",
        client,
        cases: [],
        performedBy: user,
        lineOrder: 0,
        description: "Pregled ugovora (1 h 0 min)",
        serviceDate: "2026-09-10",
        netAmount: "0.00",
        vatRate: "0.00",
        vatAmount: "0.00",
        grossAmount: "0.00",
        currency: "RSD",
        status: "RESERVED",
        sourceType: "WORK_ENTRY_GROUP",
        sourceId: null,
        pricingRequired,
        minutes: 60,
        workEntries: [],
        billedAt: null,
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    total: "0.00",
  };
}

describe("FinanceInvoiceDetailComponent send", () => {
  const api = { invoice: jest.fn(), sendInvoice: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };
  let role: WorkspaceRole = WorkspaceRole.OWNER;

  function create(
    pricingRequired: boolean,
  ): ComponentFixture<FinanceInvoiceDetailComponent> {
    api.invoice.mockReturnValue(of(invoice(pricingRequired)));
    const fixture = TestBed.createComponent(FinanceInvoiceDetailComponent);
    fixture.detectChanges();
    return fixture;
  }

  const sendButton = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="send-invoice"]',
    ) as HTMLButtonElement;

  const editLink = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="edit-invoice"]',
    ) as HTMLAnchorElement | null;

  beforeEach(() => {
    jest.clearAllMocks();
    role = WorkspaceRole.OWNER;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FinancialsApiClient, useValue: api },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast },
        {
          provide: AuthState,
          useValue: { activeWorkspace: () => ({ role }) },
        },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string) => key,
            language: () => "SR",
          },
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

  it("disables send and explains why while a line still needs a price", () => {
    const fixture = create(true);
    const element = fixture.nativeElement as HTMLElement;

    expect(sendButton(fixture).disabled).toBe(true);
    expect(
      element.querySelector('[data-testid="send-blocked-notice"]')?.textContent,
    ).toContain("finance.pricingRequiredNotice");
    expect(
      element.querySelector('[data-testid="pricing-required-badge"]')
        ?.textContent,
    ).toContain("finance.pricingRequired");

    sendButton(fixture).click();
    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(api.sendInvoice).not.toHaveBeenCalled();
  });

  it("links a draft invoice to its edit page", () => {
    const fixture = create(false);

    expect(editLink(fixture)?.getAttribute("href")).toBe(
      "/finance/invoices/invoice-1/edit",
    );
  });

  it("sends a fully priced draft after confirmation", () => {
    const fixture = create(false);
    confirmDialog.confirm.mockReturnValue(of(true));
    api.sendInvoice.mockReturnValue(of({ ...invoice(false), status: "SENT" }));

    expect(sendButton(fixture).disabled).toBe(false);
    sendButton(fixture).click();
    fixture.detectChanges();

    expect(api.sendInvoice).toHaveBeenCalledWith("invoice-1");
    expect(toast.success).toHaveBeenCalled();
    expect(sendButton(fixture)).toBeNull();
    expect(editLink(fixture)).toBeNull();
  });

  it("hides send from roles that cannot manage billing", () => {
    role = WorkspaceRole.LAWYER;
    const fixture = create(false);

    expect(sendButton(fixture)).toBeNull();
  });

  it.each([
    ["Price every line before sending", "finance.statementSendPricingError"],
    ["Only draft statements can be sent", "finance.statementSendNotDraftError"],
  ])("explains a 409 (%s) and reloads the invoice", (message, key) => {
    const fixture = create(false);
    confirmDialog.confirm.mockReturnValue(of(true));
    api.sendInvoice.mockReturnValue(
      throwError(() => ({ status: 409, error: { message } })),
    );

    sendButton(fixture).click();

    expect(toast.error).toHaveBeenCalledWith(key);
    expect(api.invoice).toHaveBeenCalledTimes(2);
  });
});
