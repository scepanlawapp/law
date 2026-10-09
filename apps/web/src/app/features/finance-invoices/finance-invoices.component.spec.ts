import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { InvoiceSummary } from "@law/api-interfaces";
import { of } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { FinanceInvoicesComponent } from "./finance-invoices.component";

describe("FinanceInvoicesComponent pagination", () => {
  const invoices = Array.from({ length: 121 }, (_, index) => ({
    id: `invoice-${index}`,
    invoiceNumber: `INV-${index}`,
    client: { id: "client-1" },
    currency: "RSD",
    status: "DRAFT",
  })) as InvoiceSummary[];
  const clientsApi = { list: jest.fn(() => of({ items: [] })) };
  let component: FinanceInvoicesComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: FinancialsApiClient,
          useValue: { invoices: () => of(invoices) },
        },
        { provide: ClientsApiClient, useValue: clientsApi },
        { provide: ConfirmDialogService, useValue: {} },
        { provide: ToastService, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(
      () => new FinanceInvoicesComponent(),
    );
  });

  it("defaults to 50 rows and navigates numbered pages without changing lookups", () => {
    expect(component.pageSize()).toBe(50);
    expect(component.pageCount()).toBe(3);
    expect(component.visibleInvoices()).toHaveLength(50);
    component.changePage(3);
    expect(component.visibleInvoices()).toEqual(invoices.slice(100));
    component.changePage(4);
    expect(component.page()).toBe(3);
    expect(clientsApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  });

  it("resets on page size and filter changes", () => {
    component.changePage(3);
    component.changePageSize(20);
    expect(component.page()).toBe(1);
    expect(component.pageCount()).toBe(7);
    expect(component.visibleInvoices()).toHaveLength(20);
    component.changePage(4);
    component.setClientIds(["missing"]);
    expect(component.page()).toBe(1);
    expect(component.visibleInvoices()).toEqual([]);
    expect(component.pageCount()).toBe(1);
    component.clearFilters();
    expect(component.visibleInvoices()).toHaveLength(20);
  });
});
