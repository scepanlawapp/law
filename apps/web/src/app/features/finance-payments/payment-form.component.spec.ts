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
  let api: { options: jest.Mock; eligible: jest.Mock; save: jest.Mock };
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
