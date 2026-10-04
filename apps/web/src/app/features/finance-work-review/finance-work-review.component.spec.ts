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
    description: `Rad ${id}`,
    serviceCategory: null,
    treatment: "HOURLY",
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    statementId: null,
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
  const entries = { list: jest.fn() };
  const router = { navigate: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };

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

  it("starts a new statement for the selected entries of one client", () => {
    const fixture = create();

    checkboxes(fixture)[0].click();
    checkboxes(fixture)[1].click();
    fixture.detectChanges();
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="new-statement"]',
      ) as HTMLButtonElement
    ).click();

    expect(router.navigate).toHaveBeenCalledWith(["/finance/statements/new"], {
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
});
