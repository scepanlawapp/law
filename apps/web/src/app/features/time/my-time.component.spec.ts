import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { MyTimeComponent } from "./my-time.component";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import { addDays, mondayOf, officeToday } from "./time-utils";

const client = (id: string, displayName: string) => ({
  id,
  clientNumber: id,
  type: "COMPANY" as const,
  displayName,
  status: "ACTIVE" as const,
});

const WEEK = mondayOf(officeToday());

function entry(overrides: Partial<WorkEntry>): WorkEntry {
  return {
    id: "entry-1",
    user: { id: "user-1", displayName: "Ana", email: null },
    client: client("client-1", "Telenor"),
    case: null,
    workDate: WEEK,
    minutes: 30,
    timerStartedAt: null,
    description: "Pregled ugovora",
    serviceCategory: null,
    treatment: "UNDECIDED",
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    invoiceId: null,
    aiParsed: false,
    createdAt: "2026-10-04T08:00:00.000Z",
    updatedAt: "2026-10-04T08:00:00.000Z",
    ...overrides,
  };
}

const page = (items: WorkEntry[], pageNumber = 1, totalPages = 1) => ({
  items,
  meta: {
    page: pageNumber,
    pageSize: 100,
    totalItems: items.length,
    totalPages,
    hasPreviousPage: pageNumber > 1,
    hasNextPage: pageNumber < totalPages,
    sort: [],
  },
});

describe("MyTimeComponent", () => {
  const api = { list: jest.fn() };
  const capture = { open: jest.fn() };

  const entries = [
    entry({ id: "a", minutes: 30 }),
    entry({ id: "b", minutes: 90, description: "Poziv" }),
    entry({
      id: "c",
      workDate: addDays(WEEK, 2),
      minutes: 45,
      client: client("client-2", "Delta"),
    }),
    entry({
      id: "d",
      workDate: addDays(WEEK, 6),
      minutes: 15,
      status: "BILLED",
    }),
  ];

  function create(): ComponentFixture<MyTimeComponent> {
    const fixture = TestBed.createComponent(MyTimeComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    api.list.mockReturnValue(of(page(entries)));
    capture.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: QuickCaptureDialogService, useValue: capture },
        {
          provide: AuthState,
          useValue: { session: signal({ user: { id: "user-1" } }) },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  const root = (fixture: ComponentFixture<unknown>) =>
    fixture.nativeElement as HTMLElement;

  it("requests the current Monday-to-Sunday week for the signed-in user", () => {
    create();

    expect(api.list).toHaveBeenCalledWith({
      userIds: ["user-1"],
      from: WEEK,
      to: addDays(WEEK, 6),
      page: 1,
      pageSize: 100,
    });
  });

  it("sums the week, each day and each client in minutes", () => {
    const fixture = create();

    expect(fixture.componentInstance.weekMinutes()).toBe(180);
    expect(
      root(fixture).querySelector('[data-testid="week-total"]')?.textContent,
    ).toContain("3h");
    expect(fixture.componentInstance.days().map((day) => day.minutes)).toEqual([
      120, 0, 45, 0, 0, 0, 15,
    ]);
    expect(
      fixture.componentInstance
        .clientTotals()
        .map((total) => [total.client.displayName, total.minutes]),
    ).toEqual([
      ["Telenor", 135],
      ["Delta", 45],
    ]);
    expect(
      root(fixture).querySelectorAll('[data-testid="client-total"]'),
    ).toHaveLength(2);
  });

  it("loads every page of a busy week", () => {
    api.list
      .mockReturnValueOnce(of(page([entries[0]], 1, 2)))
      .mockReturnValueOnce(of(page([entries[1]], 2, 2)));

    const fixture = create();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.weekMinutes()).toBe(120);
  });

  it("opens the edit dialog for an editable entry and refreshes after saving", () => {
    capture.open.mockReturnValue(of(entries[0]));
    const fixture = create();

    const [first] = Array.from(
      root(fixture).querySelectorAll<HTMLButtonElement>(
        'button[data-testid="entry"]',
      ),
    );
    first.click();

    expect(capture.open).toHaveBeenCalledWith({ mode: "edit", entryId: "a" });
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("renders billed entries read-only", () => {
    const fixture = create();

    const rows = Array.from(
      root(fixture).querySelectorAll('[data-testid="entry"]'),
    );
    const billed = rows.find((row) =>
      row.textContent?.includes("time.status.billed"),
    );

    expect(billed?.tagName).toBe("DIV");
    expect(rows.filter((row) => row.tagName === "BUTTON")).toHaveLength(3);

    fixture.componentInstance.edit(entries[3]);
    expect(capture.open).not.toHaveBeenCalled();
  });

  it("navigates between weeks and back to today", () => {
    const fixture = create();

    fixture.componentInstance.previousWeek();
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: addDays(WEEK, -7),
        to: addDays(WEEK, -1),
      }),
    );
    expect(fixture.componentInstance.isCurrentWeek()).toBe(false);

    fixture.componentInstance.goToToday();
    fixture.detectChanges();
    expect(fixture.componentInstance.weekStart()).toBe(WEEK);
  });
});
