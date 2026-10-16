import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { InvoiceSummary } from "@law/api-interfaces";
import { of } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from "../../shared/pagination/paginated-list";
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

  it("defaults to the global page size and navigates numbered pages without changing lookups", () => {
    expect(component.pagination.pageSize()).toBe(DEFAULT_PAGE_SIZE);
    expect(component.pagination.pageCount()).toBe(2);
    expect(component.visibleInvoices()).toHaveLength(100);
    component.pagination.changePage(2);
    expect(component.visibleInvoices()).toEqual(invoices.slice(100));
    component.pagination.changePage(3);
    expect(component.pagination.page()).toBe(2);
    expect(clientsApi.list).toHaveBeenCalledWith(FIRST_PAGE);
  });

  it("resets on page size and filter changes", () => {
    component.pagination.changePage(3);
    component.pagination.changePageSize(20);
    expect(component.pagination.page()).toBe(1);
    expect(component.pagination.pageCount()).toBe(7);
    expect(component.visibleInvoices()).toHaveLength(20);
    component.pagination.changePage(4);
    component.setClientIds(["missing"]);
    expect(component.pagination.page()).toBe(1);
    expect(component.visibleInvoices()).toEqual([]);
    expect(component.pagination.pageCount()).toBe(1);
    component.clearFilters();
    expect(component.visibleInvoices()).toHaveLength(20);
  });
});
