import { TestBed } from "@angular/core/testing";
import { CasesApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { InvoiceLineImportDialogComponent } from "./invoice-line-import-dialog.component";
import { InvoiceLineImportDialogContext } from "./invoice-line-import-dialog.models";

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

function entry(id: string): WorkEntry {
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
    treatment: "HOURLY",
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
    context = { ...context, excludedEntryIds: ["entry-2"] };
    workEntries.list.mockReturnValue(
      of({
        items: [entry("entry-1"), entry("entry-2")],
        meta: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
      }),
    );
    TestBed.configureTestingModule({
      providers: [
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
        { provide: BrnDialogRef, useValue: { close: jest.fn() } },
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
  });
});
