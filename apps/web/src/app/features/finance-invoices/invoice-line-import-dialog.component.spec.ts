import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { CasesApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { InvoiceLineImportDialogComponent } from "./invoice-line-import-dialog.component";
import {
  InvoiceLineImportDialogContext,
  InvoiceLineImportResult,
} from "./invoice-line-import-dialog.models";

let context: InvoiceLineImportDialogContext = {
  client: {
    id: "client-1",
    clientNumber: "KL-1",
    displayName: "Telenor",
    type: "COMPANY",
    status: "ACTIVE",
  },
  excludedEntryIds: ["entry-2"],
};

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => context,
}));

function entry(
  id: string,
  treatment: WorkEntry["treatment"] = "HOURLY",
): WorkEntry {
  return {
    id,
    user: { id: "user-1", displayName: "Ana Anić", email: null },
    client: context.client,
    case: null,
    workDate: "2026-10-05",
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
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
  };
}

describe("InvoiceLineImportDialogComponent", () => {
  const workEntries = { list: jest.fn() };
  const dialogRef = { close: jest.fn() };
  const quickCapture = { open: jest.fn() };

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

  beforeEach(() => {
    jest.clearAllMocks();
    quickCapture.open.mockReturnValue(of(null));
    context = { ...context, excludedEntryIds: ["entry-2"] };
    workEntries.list.mockReturnValue(
      of({
        items: [
          entry("entry-1"),
          entry("entry-2"),
          entry("entry-3", "UNDECIDED"),
        ],
        meta: { page: 1, pageSize: 10, totalItems: 3, totalPages: 1 },
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkEntriesApiClient, useValue: workEntries },
        {
          provide: CasesApiClient,
          useValue: {
            list: () =>
              of({
                items: [],
                meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
              }),
          },
        },
        { provide: BrnDialogRef, useValue: dialogRef },
        { provide: QuickCaptureDialogService, useValue: quickCapture },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  it("toggles enabled rows and leaves already-added rows unchanged", () => {
    const fixture = TestBed.createComponent(InvoiceLineImportDialogComponent);
    fixture.detectChanges();
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="import-entry"]',
      ),
    ) as HTMLTableRowElement[];

    rows[0].cells[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected().has("entry-1")).toBe(true);

    rows[0].cells[1].click();
    rows[1].cells[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected().size).toBe(0);

    rows[2].cells[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected().has("entry-3")).toBe(true);

    fixture.componentInstance.setCaseId("case-7");
    expect(workEntries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caseId: "case-7",
        page: 1,
        statuses: ["CONFIRMED"],
        unbilledOnly: true,
      }),
    );
  });

  it("defaults to 50 and preserves selection when size changes without route navigation", () => {
    const fixture = TestBed.createComponent(InvoiceLineImportDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(workEntries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    component.toggle(entry("entry-1"));
    component.page.set(2);
    component.changePageSize(20);
    expect(workEntries.list).toHaveBeenCalledTimes(2);
    expect(workEntries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    expect(component.selected().has("entry-1")).toBe(true);
    expect(
      fixture.nativeElement.querySelector(
        "hlm-numbered-pagination-query-params",
      ),
    ).toBeNull();
  });

  it("shows recorded work value and currency with localized missing-value labels", () => {
    workEntries.list.mockReturnValue(
      of({
        items: [
          { ...entry("entry-1"), value: "1234567.8", currency: "RSD" },
          { ...entry("entry-2"), value: null, currency: null },
        ],
        meta: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
      }),
    );
    const fixture = TestBed.createComponent(InvoiceLineImportDialogComponent);
    fixture.detectChanges();

    const table = (fixture.nativeElement as HTMLElement).querySelector("table");
    const headers = Array.from(table?.querySelectorAll("th") ?? []);
    const rows = Array.from(table?.querySelectorAll("tbody tr") ?? []);

    expect(headers[6].textContent?.trim()).toBe("finance.workValueShort");
    expect(headers[7].textContent?.trim()).toBe("finance.currency");
    expect(headers[8].textContent?.trim()).toBe("finance.viewWorkEntry");
    expect(rows[0].querySelectorAll("td")[6].textContent?.trim()).toBe(
      "1.234.567,80",
    );
    expect(rows[0].querySelectorAll("td")[7].textContent?.trim()).toBe("RSD");
    expect(rows[1].querySelectorAll("td")[6].textContent?.trim()).toBe(
      "time.capture.noWorkValue",
    );
    expect(rows[1].querySelectorAll("td")[7].textContent?.trim()).toBe(
      "time.capture.noCurrency",
    );
  });

  it("shows the description in a three-line tooltip and opens the full entry without toggling selection", () => {
    const description =
      "A full work description that continues beyond the row.";
    workEntries.list.mockReturnValue(
      of({
        items: [
          {
            ...entry("entry-1"),
            description,
            case: {
              id: "case-1",
              caseNumber: "P-123",
              name: "Example matter",
            },
          },
        ],
        meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      }),
    );
    const fixture = TestBed.createComponent(InvoiceLineImportDialogComponent);
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="import-entry"]',
    ) as HTMLTableRowElement;
    const descriptionElement = row.querySelector(".line-clamp-3");
    const viewButton = row.querySelector("button") as HTMLButtonElement;

    expect(descriptionElement?.textContent?.trim()).toBe(description);
    expect(descriptionElement?.getAttribute("title")).toBe(description);
    expect(descriptionElement?.classList.contains("line-clamp-3")).toBe(true);
    expect(row.textContent).toContain("Rad entry-1");
    expect(row.textContent).toContain("P-123");
    expect(viewButton.getAttribute("aria-label")).toBe("finance.viewWorkEntry");
    expect(viewButton.title).toBe("finance.viewWorkEntry");

    viewButton.click();

    expect(quickCapture.open).toHaveBeenCalledWith({
      mode: "view",
      entryId: "entry-1",
    });
    expect(fixture.componentInstance.selected().size).toBe(0);
  });

  it("returns separate mode by default and grouped mode with cross-page selection", () => {
    workEntries.list
      .mockReturnValueOnce(
        of({
          items: [entry("entry-1")],
          meta: { page: 1, pageSize: 10, totalItems: 11, totalPages: 2 },
        }),
      )
      .mockReturnValueOnce(
        of({
          items: [entry("entry-3")],
          meta: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
        }),
      );
    const fixture = TestBed.createComponent(InvoiceLineImportDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.mode()).toBe("SEPARATE");
    component.toggle(entry("entry-1"));
    component.changePage(2);
    expect(component.page()).toBe(2);
    component.toggle(entry("entry-3"));
    component.mode.set("GROUPED");
    component.importSelected();

    expect(dialogRef.close).toHaveBeenCalledWith<InvoiceLineImportResult>({
      entries: [entry("entry-1"), entry("entry-3")],
      mode: "GROUPED",
    });
    expect(workEntries.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 2,
        statuses: ["CONFIRMED"],
        treatments: ["RETAINER", "HOURLY", "AT", "UNDECIDED"],
        unbilledOnly: true,
      }),
    );
  });
});
