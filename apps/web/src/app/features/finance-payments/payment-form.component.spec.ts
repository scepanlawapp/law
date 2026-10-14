import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import { InvoiceCollection, PaymentDetail } from "@law/api-interfaces";
import { of, throwError } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { PaymentFormComponent } from "./payment-form.component";
import { decimal, minor } from "./payment-ui";
const invoice: InvoiceCollection = {
  id: "invoice-1",
  invoiceNumber: "R-1",
  clientId: "client-1",
  clientName: "Klijent",
  currency: "RSD",
  dateOfCreate: "2026-01-01",
  dateOfMaturity: "2026-01-05",
  grossAmount: "100.00",
  paidAmount: "0.00",
  remainingAmount: "100.00",
  collectionStatus: "UNPAID",
  overdue: true,
  daysOverdue: 1,
  status: "SENT",
};
describe("PaymentFormComponent", () => {
  let component: PaymentFormComponent;
  let api: {
    options: jest.Mock;
    eligible: jest.Mock;
    save: jest.Mock;
    preview: jest.Mock;
  };
  let navigate: jest.Mock;
  beforeEach(async () => {
    api = {
      options: jest.fn(() =>
        of({
          today: "2026-10-14",
          currencies: ["RSD", "EUR"],
          defaultCurrency: "RSD",
          bankAccounts: [],
        }),
      ),
      eligible: jest.fn(() => of([invoice])),
      preview: jest.fn(() =>
        of({
          allocations: [{ invoiceId: invoice.id, amount: "50.00" }],
          unallocatedAmount: "50.00",
          allocatedAmount: "50.00",
          warning: null,
        }),
      ),
      save: jest.fn(() => of({ id: "saved" } as PaymentDetail)),
    };
    navigate = jest.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PaymentsApiClient, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: Router, useValue: { navigate } },
        {
          provide: ConfirmDialogService,
          useValue: { confirm: () => of(true) },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new PaymentFormComponent());
    await component.load();
  });
  it("starts at zero, previews without saving, and preserves allocations when deselected", async () => {
    component.form.patchValue({ clientId: "client-1", amount: "100.00" });
    await component.loadEligible();
    expect(component.allocatedText()).toBe("0.00");
    component.toggleSelection(invoice.id, true);
    await component.distribute("EQUAL");
    expect(api.preview).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "EQUAL", invoiceIds: [invoice.id] }),
    );
    expect(api.save).not.toHaveBeenCalled();
    expect(component.allocatedText()).toBe("50.00");
    component.toggleSelection(invoice.id, false);
    expect(component.allocatedText()).toBe("50.00");
    component.allocation(invoice.id)!.controls.amount.setValue("30.00");
    expect(component.remainingText()).toBe("70.00");
    expect(component.feedback()).toBe("");
    component.clearProposal();
    expect(component.allocatedText()).toBe("0.00");
    await component.submit();
    expect(api.save.mock.calls[0][1].allocations).toEqual([]);
  });
  it("clears the statement when the bank changes and prevents new advance previews", async () => {
    component.form.patchValue({
      bankAccountId: "bank-1",
      bankStatementNumber: "015",
      purpose: "ADVANCE",
    });
    component.form.controls.bankAccountId.setValue("bank-2");
    expect(component.form.controls.bankStatementNumber.value).toBe("");
    await component.distribute("AUTOMATIC");
    expect(api.preview).not.toHaveBeenCalled();
  });
  it("keeps the manual proposal if replacement is declined or the preview fails", async () => {
    component.form.patchValue({ clientId: "client-1", amount: "100.00" });
    await component.loadEligible();
    component.allocation(invoice.id)!.controls.amount.setValue("25.00");
    const confirmation = jest.spyOn(
      TestBed.inject(ConfirmDialogService),
      "confirm",
    );
    confirmation.mockReturnValueOnce(of(false));
    await component.distribute("AUTOMATIC");
    expect(api.preview).not.toHaveBeenCalled();
    expect(component.allocatedText()).toBe("25.00");
    api.preview.mockReturnValueOnce(
      throwError(() => ({ error: { message: "Veza je prekinuta." } })),
    );
    await component.distribute("AUTOMATIC");
    expect(component.allocatedText()).toBe("25.00");
    expect(component.error()).toBe("Veza je prekinuta.");
    expect(component.feedback()).toBe("");
  });
  it("saves an unidentified advance with no invoice and keeps the full available balance", async () => {
    component.form.patchValue({ amount: "100.10", purpose: "ADVANCE" });
    await component.submit();
    expect(api.save.mock.calls[0][1]).toMatchObject({
      clientId: null,
      purpose: "ADVANCE",
      amount: "100.10",
      allocations: [],
    });
    expect(navigate).toHaveBeenCalledWith(["/finance/payments", "saved"]);
  });
  it("calculates multiple allocations without floating-point rounding and caps the quick action", () => {
    component.form.controls.amount.setValue("0.30");
    component.add({ ...invoice, remainingAmount: "0.10" });
    component.add({ ...invoice, id: "invoice-2", remainingAmount: "0.20" });
    expect(component.allocatedText()).toBe("0.30");
    expect(component.remainingText()).toBe("0.00");
    expect(decimal(minor("9999999999999999.99"))).toBe("9999999999999999.99");
  });
  it("blocks over-allocation before submission", async () => {
    component.form.controls.amount.setValue("50");
    component.invoices.set([invoice]);
    component.add(invoice, "60");
    await component.submit();
    expect(api.save).not.toHaveBeenCalled();
    expect(component.error()).toContain("raspodela");
  });
  it("keeps allocations when client changes and requires an explicit correction", async () => {
    component.form.patchValue({ clientId: "client-1", amount: "100" });
    component.add(invoice, "50");
    api.eligible.mockReturnValue(of([]));
    component.form.controls.clientId.setValue("client-2");
    await component.loadEligible();
    expect(component.form.controls.allocations.length).toBe(1);
    await component.submit();
    expect(api.save).not.toHaveBeenCalled();
    expect(component.error()).toContain("klijentu");
  });
  it("preserves input after a failed save and reuses the idempotency key on retry", async () => {
    component.form.controls.amount.setValue("100");
    api.save.mockReturnValueOnce(
      throwError(() => ({ error: { message: "Veza je prekinuta." } })),
    );
    await component.submit();
    expect(component.form.controls.amount.value).toBe("100");
    expect(navigate).not.toHaveBeenCalled();
    await component.submit();
    expect(api.save.mock.calls[0][2]).toBe(api.save.mock.calls[1][2]);
  });
  it("changes the retry key when the submitted content changes", async () => {
    api.save.mockReturnValue(
      throwError(() => ({ error: { message: "Greška" } })),
    );
    component.form.controls.amount.setValue("100");
    await component.submit();
    component.form.controls.amount.setValue("101");
    await component.submit();
    expect(api.save.mock.calls[0][2]).not.toBe(api.save.mock.calls[1][2]);
  });
});
