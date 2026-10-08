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

const page = (items: WorkEntry[], pageNumber: number, totalPages: number) => ({
  items,
  meta: {
    page: pageNumber,
    pageSize: 25,
    totalItems: items.length,
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
    api.list.mockReturnValue(of(page([entry("e1", "CONFIRMED")], 1, 1)));
    references.users.mockReturnValue(of([]));
    clients.list.mockReturnValue(of({ items: [], meta: {} }));
    cases.list.mockReturnValue(of({ items: [], meta: {} }));
    capture.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: ReferencesApiClient, useValue: references },
        { provide: ClientsApiClient, useValue: clients },
        { provide: CasesApiClient, useValue: cases },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOffDialog },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
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

  it("loads the first page without filters", () => {
    create();

    expect(api.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      userIds: undefined,
      clientIds: undefined,
      caseId: undefined,
      statuses: undefined,
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
      pageSize: 25,
      userIds: ["user-1"],
      clientIds: ["client-1", "client-2"],
      caseId: "case-1",
      statuses: ["PROPOSED", "CONFIRMED"],
      treatments: ["HOURLY"],
      from: "2026-10-01",
      to: "2026-10-31",
    });
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

  it("appends the next page on Load more", () => {
    api.list
      .mockReturnValueOnce(of(page([entry("e1", "CONFIRMED")], 1, 2)))
      .mockReturnValueOnce(of(page([entry("e2", "PROPOSED")], 2, 2)));
    const fixture = create();
    expect(rows(fixture)).toHaveLength(1);

    const loadMore = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((item) => item.textContent?.includes("work.loadMore"));
    loadMore?.click();
    fixture.detectChanges();

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(rows(fixture)).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      "work.loadMore",
    );
  });

  it("offers edit and write-off only on editable rows", () => {
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
    expect(proposed).toEqual(["common.edit", "time.review.writeOff"]);
    expect(confirmed).toEqual(["common.edit", "time.review.writeOff"]);
    expect(billed).toEqual(["work.entries.view"]);
    expect(writtenOff).toEqual(["work.entries.view"]);
    expect(running).toEqual(["work.entries.view"]);
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
    expect(buttons(rows(fixture)[0])).toEqual(["work.entries.view"]);
  });

  it("does not write off when the reason dialog is dismissed", () => {
    writeOffDialog.open.mockReturnValue(of(null));
    const fixture = create();

    fixture.componentInstance.writeOff(fixture.componentInstance.entries()[0]);

    expect(api.writeOff).not.toHaveBeenCalled();
  });
});
