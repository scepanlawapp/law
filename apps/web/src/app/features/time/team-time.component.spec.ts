import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { AuthState } from "@law/security";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import { WorkEntry, WorkEntryStatus } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import { TeamTimeComponent } from "./team-time.component";
import { WriteOffDialogService } from "./write-off-dialog/write-off-dialog.service";

const client = (id: string, displayName: string) => ({
  id,
  clientNumber: id,
  type: "COMPANY" as const,
  displayName,
  status: "ACTIVE" as const,
});

function entry(id: string, status: WorkEntryStatus): WorkEntry {
  return {
    id,
    user: { id: "user-1", displayName: "Ana", email: null },
    client: client("client-1", "Telenor"),
    case: null,
    workDate: "2026-10-01",
    minutes: 30,
    timerStartedAt: null,
    title: `Opis ${id}`,
    description: "",
    serviceCategory: null,
    treatment: "UNDECIDED",
    status,
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    invoiceId: null,
    aiParsed: false,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  };
}

const page = (
  items: WorkEntry[],
  pageNumber: number,
  totalPages: number,
  totalItems = totalPages > 1 ? (totalPages - 1) * 100 + 1 : items.length,
) => ({
  items,
  meta: {
    page: pageNumber,
    pageSize: 100,
    totalItems,
    totalPages,
    hasPreviousPage: pageNumber > 1,
    hasNextPage: pageNumber < totalPages,
    sort: [],
  },
});

describe("TeamTimeComponent", () => {
  const api = { list: jest.fn(), writeOff: jest.fn() };
  const references = { users: jest.fn() };
  const clients = { list: jest.fn() };
  const cases = { list: jest.fn() };
  const capture = { open: jest.fn() };
  const writeOffDialog = { open: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };
  const session = signal<{ user: { id: string } } | null>({
    user: { id: "user-1" },
  });

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
    jest.resetAllMocks();
    session.set({ user: { id: "user-1" } });
    api.list.mockReturnValue(of(page([entry("e1", "CONFIRMED")], 1, 1)));
    references.users.mockReturnValue(of([]));
    clients.list.mockReturnValue(of({ items: [], meta: {} }));
    cases.list.mockReturnValue(of({ items: [], meta: {} }));
    capture.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthState, useValue: { session } },
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: ReferencesApiClient, useValue: references },
        { provide: ClientsApiClient, useValue: clients },
        { provide: CasesApiClient, useValue: cases },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOffDialog },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string) => key,
            language: () => "SR",
            locale: () => "sr-Latn-RS",
          },
        },
      ],
    });
  });

  function create(): ComponentFixture<TeamTimeComponent> {
    const fixture = TestBed.createComponent(TeamTimeComponent);
    fixture.detectChanges();
    return fixture;
  }

  const rows = (fixture: ComponentFixture<unknown>) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-testid="team-entry"]',
      ),
    );
  const buttons = (row: HTMLElement) =>
    Array.from(row.querySelectorAll("button")).map((item) =>
      item.textContent?.trim(),
    );

  it("loads the first page with only proposed, running, and confirmed statuses", () => {
    create();

    expect(api.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      userIds: undefined,
      clientIds: undefined,
      caseId: undefined,
      statuses: ["PROPOSED", "RUNNING", "CONFIRMED"],
      treatments: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("maps every filter into the query and restarts from page 1", () => {
    const fixture = create();
    const component = fixture.componentInstance;

    component.setPeopleIds(["user-1"]);
    component.setClientIds(["client-1", "client-2"]);
    component.setCaseId("case-1");
    component.setStatuses(["PROPOSED", "CONFIRMED"]);
    component.setTreatments(["HOURLY"]);
    component.from.setValue("2026-10-01");
    component.to.setValue("2026-10-31");

    expect(api.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 100,
      userIds: ["user-1"],
      clientIds: ["client-1", "client-2"],
      caseId: "case-1",
      statuses: ["PROPOSED", "CONFIRMED"],
      treatments: ["HOURLY"],
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("allows clearing default statuses without losing other filters", () => {
    const component = create().componentInstance;
    component.setClientIds(["client-1"]);
    component.setStatuses([]);
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: undefined,
        clientIds: ["client-1"],
        page: 1,
      }),
    );
  });

  it("scopes the reusable table to the current user without loading or showing people", () => {
    const fixture = TestBed.createComponent(TeamTimeComponent);
    fixture.componentRef.setInput("currentUserOnly", true);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(references.users).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[buttonId="team-time-people"], #team-time-people',
      ),
    ).toBeNull();
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ userIds: ["user-1"] }),
    );

    component.setPeopleIds(["other-user"]);
    component.setClientIds(["client-1"]);
    component.setCaseId("case-1");
    component.setStatuses(["CONFIRMED"]);
    component.setTreatments(["HOURLY"]);
    component.from.setValue("2026-10-01");
    component.to.setValue("2026-10-31");

    expect(api.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 100,
      userIds: ["user-1"],
      clientIds: ["client-1"],
      caseId: "case-1",
      statuses: ["CONFIRMED"],
      treatments: ["HOURLY"],
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("never makes an unscoped request while the current-user session is unavailable", () => {
    session.set(null);
    const fixture = TestBed.createComponent(TeamTimeComponent);
    fixture.componentRef.setInput("currentUserOnly", true);
    fixture.detectChanges();
    expect(api.list).not.toHaveBeenCalled();

    session.set({ user: { id: "user-2" } });
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ userIds: ["user-2"] }),
    );

    session.set(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.entries()).toEqual([]);
    expect(fixture.componentInstance.totalItems()).toBe(0);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed date and clears an emptied filter", () => {
    const fixture = create();
    const component = fixture.componentInstance;

    component.from.setValue("2026-13-45");
    component.setCaseId("case-1");
    component.setCaseId("");

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: undefined, caseId: undefined }),
    );
  });

  it("renders numbered pagination without an infinite-scroll observer or sentinel", () => {
    let observerCreations = 0;
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor() {
        observerCreations += 1;
      }
      observe(): void {
        // no observer should be attached on this page
      }
      unobserve(): void {
        // no observer should be attached on this page
      }
      disconnect(): void {
        // no observer should be attached on this page
      }
    } as unknown as typeof IntersectionObserver;
    const fixture = create();
    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector("law-pagination")).not.toBeNull();
    expect(nativeElement.querySelector("[aria-hidden='true'].h-px")).toBeNull();
    expect(observerCreations).toBe(0);
    if (original) globalThis.IntersectionObserver = original;
    else Reflect.deleteProperty(globalThis, "IntersectionObserver");
  });

  it("requests the selected page and replaces the visible rows", () => {
    api.list
      .mockReturnValueOnce(of(page([entry("e1", "CONFIRMED")], 1, 2)))
      .mockReturnValueOnce(of(page([entry("e2", "PROPOSED")], 2, 2)));
    const fixture = create();
    expect(rows(fixture)).toHaveLength(1);
    const next = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLButtonElement>('[aria-label="pagination.next"]');
    expect(next).not.toBeNull();
    next?.click();
    fixture.detectChanges();

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(rows(fixture)).toHaveLength(1);
    expect(rows(fixture).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Opis e2"),
    ]);
  });

  it("resets to page one when a filter changes", () => {
    api.list
      .mockReturnValueOnce(of(page([entry("e1", "CONFIRMED")], 1, 2)))
      .mockReturnValueOnce(of(page([entry("e2", "PROPOSED")], 2, 2)))
      .mockReturnValueOnce(of(page([entry("e3", "PROPOSED")], 1, 1)));
    const fixture = create();

    fixture.componentInstance.list.changePage(2);
    fixture.componentInstance.setStatuses(["PROPOSED"]);

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, statuses: ["PROPOSED"] }),
    );
    expect(fixture.componentInstance.list.page()).toBe(1);
  });

  it("resets to page one when the page size changes", () => {
    api.list
      .mockReturnValueOnce(of(page([entry("e1", "CONFIRMED")], 1, 2)))
      .mockReturnValueOnce(of(page([entry("e2", "PROPOSED")], 2, 2)))
      .mockReturnValueOnce(of(page([entry("e3", "PROPOSED")], 1, 1)));
    const fixture = create();
    fixture.componentInstance.list.changePage(2);

    fixture.componentInstance.list.changePageSize(50);

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    expect(fixture.componentInstance.list.page()).toBe(1);
    expect(fixture.componentInstance.list.pageSize()).toBe(50);
  });

  it("clamps to the last available page when the result count shrinks", () => {
    api.list
      .mockReturnValueOnce(of(page([entry("e1", "CONFIRMED")], 1, 3, 201)))
      .mockReturnValueOnce(of(page([], 3, 2, 170)))
      .mockReturnValueOnce(of(page([entry("e2", "PROPOSED")], 2, 2, 170)));
    const fixture = create();
    fixture.componentInstance.list.changePage(3);

    expect(api.list.mock.calls.slice(-2).map(([query]) => query?.page)).toEqual(
      [3, 2],
    );
    expect(fixture.componentInstance.list.page()).toBe(2);
    expect(fixture.componentInstance.totalItems()).toBe(170);
    fixture.detectChanges();
    expect(rows(fixture).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Opis e2"),
    ]);
  });

  it("offers only write-off on editable rows", () => {
    api.list.mockReturnValue(
      of(
        page(
          [
            entry("p", "PROPOSED"),
            entry("c", "CONFIRMED"),
            entry("b", "BILLED"),
            entry("w", "WRITTEN_OFF"),
            entry("r", "RUNNING"),
          ],
          1,
          1,
        ),
      ),
    );
    const fixture = create();

    const [proposed, confirmed, billed, writtenOff, running] =
      rows(fixture).map(buttons);
    expect(proposed).toEqual(["time.review.writeOff"]);
    expect(confirmed).toEqual(["time.review.writeOff"]);
    expect(billed).toEqual([]);
    expect(writtenOff).toEqual([]);
    expect(running).toEqual([]);
  });

  it("opens non-editable entries for viewing without allowing write-off", () => {
    const fixture = create();
    const billed = entry("b", "BILLED");

    fixture.componentInstance.edit(billed);
    fixture.componentInstance.writeOff(billed);

    expect(capture.open).toHaveBeenCalledWith({ mode: "view", entryId: "b" });
    expect(writeOffDialog.open).not.toHaveBeenCalled();
  });

  it("writes off with the entered reason and updates the row", () => {
    writeOffDialog.open.mockReturnValue(of("Greška u unosu"));
    api.writeOff.mockReturnValue(
      of({ ...entry("e1", "WRITTEN_OFF"), writeOffReason: "Greška u unosu" }),
    );
    const fixture = create();

    fixture.componentInstance.writeOff(fixture.componentInstance.entries()[0]);
    fixture.detectChanges();

    expect(api.writeOff).toHaveBeenCalledWith("e1", {
      reason: "Greška u unosu",
    });
    expect(fixture.componentInstance.entries()[0].status).toBe("WRITTEN_OFF");
    expect(buttons(rows(fixture)[0])).toEqual([]);
  });

  it("does not write off when the reason dialog is dismissed", () => {
    writeOffDialog.open.mockReturnValue(of(null));
    const fixture = create();

    fixture.componentInstance.writeOff(fixture.componentInstance.entries()[0]);

    expect(api.writeOff).not.toHaveBeenCalled();
  });
  it("opens rows by mouse or keyboard and keeps write-off clicks separate", () => {
    const priced = {
      ...entry("e1", "CONFIRMED"),
      value: "1234.50",
      currency: "EUR",
    };
    api.list.mockReturnValue(of(page([priced, entry("b", "BILLED")], 1, 1)));
    const fixture = create();
    const [editable, billed] = rows(fixture);
    expect(editable.textContent).toContain("1.234,50 EUR");
    editable.click();
    expect(capture.open).toHaveBeenLastCalledWith({
      mode: "edit",
      entryId: "e1",
    });
    billed.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(capture.open).toHaveBeenLastCalledWith({
      mode: "view",
      entryId: "b",
    });
    capture.open.mockClear();
    writeOffDialog.open.mockReturnValue(of(null));
    editable.querySelector("button")?.click();
    expect(capture.open).not.toHaveBeenCalled();
    expect(writeOffDialog.open).toHaveBeenCalled();
  });
});
