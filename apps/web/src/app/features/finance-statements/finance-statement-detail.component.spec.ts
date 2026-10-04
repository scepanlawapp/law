import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { FinancialsApiClient } from "@law/api-clients";
import { BillingStatement } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { FinanceStatementDetailComponent } from "./finance-statement-detail.component";

const client = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};
const user = { id: "user-1", displayName: "Ana Anić", email: null };

function statement(pricingRequired: boolean): BillingStatement {
  return {
    id: "statement-1",
    workspaceId: "workspace-1",
    clientId: client.id,
    statementNumber: "OBR-2026-001",
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
        statementId: "statement-1",
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

describe("FinanceStatementDetailComponent send", () => {
  const api = { statement: jest.fn(), sendStatement: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };

  function create(
    pricingRequired: boolean,
  ): ComponentFixture<FinanceStatementDetailComponent> {
    api.statement.mockReturnValue(of(statement(pricingRequired)));
    const fixture = TestBed.createComponent(FinanceStatementDetailComponent);
    fixture.detectChanges();
    return fixture;
  }

  const sendButton = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="send-statement"]',
    ) as HTMLButtonElement;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FinancialsApiClient, useValue: api },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast },
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
            snapshot: { paramMap: convertToParamMap({ id: "statement-1" }) },
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
    expect(api.sendStatement).not.toHaveBeenCalled();
  });

  it("sends a fully priced draft after confirmation", () => {
    const fixture = create(false);
    confirmDialog.confirm.mockReturnValue(of(true));
    api.sendStatement.mockReturnValue(
      of({ ...statement(false), status: "SENT" }),
    );

    expect(sendButton(fixture).disabled).toBe(false);
    sendButton(fixture).click();
    fixture.detectChanges();

    expect(api.sendStatement).toHaveBeenCalledWith("statement-1");
    expect(toast.success).toHaveBeenCalled();
    expect(sendButton(fixture)).toBeNull();
  });
});
