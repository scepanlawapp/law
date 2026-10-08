import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { WriteOffDialogService } from "../time/write-off-dialog/write-off-dialog.service";
import { FinanceWorkReviewComponent } from "./finance-work-review.component";

const client = (id: string, displayName: string) => ({
  id,
  clientNumber: id,
  type: "COMPANY" as const,
  displayName,
  status: "ACTIVE" as const,
});

function entry(id: string, clientId: string, name: string): WorkEntry {
  return {
    id,
    user: { id: "user-1", displayName: "Ana Anić", email: null },
    client: client(clientId, name),
    case: null,
    workDate: "2026-09-10",
    minutes: 60,
    timerStartedAt: null,
    title: `Rad ${id}`,
    description: "",
    serviceCategory: null,
    treatment: "HOURLY",
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

const page = (items: WorkEntry[]) => ({
  items,
  meta: { page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
});

describe("FinanceWorkReviewComponent (unbilled work)", () => {
  const capture = { open: jest.fn(() => of(null)) };
  const entries = { list: jest.fn(), writeOff: jest.fn() };
  const router = { navigate: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };
  const writeOffDialog = { open: jest.fn() };

  function create(): ComponentFixture<FinanceWorkReviewComponent> {
    const fixture = TestBed.createComponent(FinanceWorkReviewComponent);
    fixture.detectChanges();
    return fixture;
  }

  const checkboxes = (fixture: ComponentFixture<unknown>) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="unbilled-entry"] input[type="checkbox"]',
      ),
    ) as HTMLInputElement[];

  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's select and combobox primitives observe size.
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

  beforeEach(() => {
    jest.clearAllMocks();
    entries.list.mockReturnValue(
      of(
        page([
          entry("e1", "c1", "Telenor"),
          entry("e2", "c1", "Telenor"),
          entry("e3", "c2", "Delta"),
        ]),
      ),
    );
    writeOffDialog.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: entries },
        { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
        {
          provide: ClientsApiClient,
          useValue: { list: () => of(page([]) as never) },
        },
        {
          provide: CasesApiClient,
          useValue: { list: () => of(page([]) as never) },
        },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOffDialog },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  it("lists only confirmed, unbilled entries", () => {
    create();

    expect(entries.list).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ["CONFIRMED"],
        unbilledOnly: true,
        page: 1,
      }),
    );
  });

  it("starts a new invoice for the selected entries of one client", () => {
    const fixture = create();

    checkboxes(fixture)[0].click();
    checkboxes(fixture)[1].click();
    fixture.detectChanges();
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="new-invoice"]',
      ) as HTMLButtonElement
    ).click();

    expect(router.navigate).toHaveBeenCalledWith(["/finance/invoices/new"], {
      queryParams: { clientId: "c1", workEntryIds: ["e1", "e2"] },
    });
  });

  it("refuses to mix clients in one selection", () => {
    const fixture = create();

    checkboxes(fixture)[0].click();
    checkboxes(fixture)[2].click();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith("finance.selectionOneClient");
    expect(fixture.componentInstance.selectedCount()).toBe(1);
  });

  it("toggles selection from a row click without toggling from its buttons", () => {
    const fixture = create();
    const firstRow = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="unbilled-entry"]',
    ) as HTMLTableRowElement;
    const checkbox = firstRow.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    (firstRow.cells[1] as HTMLTableCellElement).click();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(true);

    (firstRow.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(true);

    (firstRow.cells[1] as HTMLTableCellElement).click();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(false);
  });

  it("writes off an entry and removes it from unbilled work", () => {
    writeOffDialog.open.mockReturnValue(of("Ne naplaćuje se"));
    entries.writeOff.mockReturnValue(
      of({
        ...entry("e1", "c1", "Telenor"),
        status: "WRITTEN_OFF",
        writeOffReason: "Ne naplaćuje se",
      }),
    );
    const fixture = create();

    entries.list.mockReturnValue(
      of(page(fixture.componentInstance.entries().slice(1))),
    );
    fixture.componentInstance.writeOff(fixture.componentInstance.entries()[0]);

    expect(entries.writeOff).toHaveBeenCalledWith("e1", {
      reason: "Ne naplaćuje se",
    });
    expect(fixture.componentInstance.entries().map((item) => item.id)).toEqual([
      "e2",
      "e3",
    ]);
    expect(toast.success).toHaveBeenCalledWith("time.writeOff.done");
  });
  it("shows billed and all statuses without the unbilled-only restriction", () => {
    const fixture = create();
    fixture.componentInstance.setStatus("BILLED");
    expect(entries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: ["BILLED"],
        unbilledOnly: undefined,
        page: 1,
      }),
    );
    fixture.componentInstance.setStatus("");
    expect(entries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuses: undefined, unbilledOnly: undefined }),
    );
  });

  it.each([
    ["WRITTEN_OFF", "edit"],
    ["CONFIRMED", "edit"],
    ["BILLED", "view"],
  ] as const)("opens %s in %s mode", (status, mode) => {
    const fixture = create();
    fixture.componentInstance.view({ ...entry("e1", "c1", "Client"), status });
    expect(capture.open).toHaveBeenCalledWith({ mode, entryId: "e1" });
  });

  it("does not invoice billed, proposed or written-off work", () => {
    const fixture = create();
    for (const status of ["BILLED", "PROPOSED", "WRITTEN_OFF"] as const) {
      const item = { ...entry("closed", "c1", "Client"), status };
      fixture.componentInstance.toggle(item);
      fixture.componentInstance.newStatementFor(item);
    }
    expect(fixture.componentInstance.selectedCount()).toBe(0);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
