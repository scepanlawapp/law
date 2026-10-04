import { TestBed, ComponentFixture } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { WorkEntriesApiClient } from "@law/api-clients";
import { TimeReviewResponse, WorkEntry } from "@law/api-interfaces";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import { TimeReviewComponent } from "./time-review.component";
import { WriteOffDialogService } from "./write-off-dialog/write-off-dialog.service";

const DATE = "2026-10-04";
const DISMISSED_KEY = `time-review-dismissed:${DATE}`;

const client = (id: string, displayName: string) => ({
  id,
  clientNumber: id,
  type: "COMPANY" as const,
  displayName,
  status: "ACTIVE" as const,
});

function entry(overrides: Partial<WorkEntry>): WorkEntry {
  return {
    id: "entry-1",
    user: { id: "user-1", displayName: "Ana", email: null },
    client: client("client-1", "Telenor"),
    case: null,
    workDate: DATE,
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

const proposedEntry = entry({
  id: "proposed-1",
  status: "PROPOSED",
  minutes: 45,
  description: "Poziv sa klijentom",
  client: client("client-2", "Delta"),
  case: {
    id: "case-9",
    caseNumber: "2026-9",
    name: "Spor",
    status: "ACTIVE",
    priority: "NORMAL",
  },
});

const review: TimeReviewResponse = {
  entries: [entry({}), entry({ id: "entry-2", minutes: 60 })],
  proposed: [proposedEntry],
  missingEvents: [
    {
      eventId: "event-1",
      title: "Sastanak u sudu",
      startsAt: "2026-10-04T08:00:00.000Z",
      endsAt: "2026-10-04T09:30:00.000Z",
      client: client("client-3", "Sud klijent"),
      case: null,
    },
  ],
  untouchedClients: [
    { client: client("client-4", "Neaktivan d.o.o."), reasons: ["DOCUMENT"] },
  ],
};

describe("TimeReviewComponent", () => {
  const api = { review: jest.fn(), remove: jest.fn(), writeOff: jest.fn() };
  const capture = { open: jest.fn() };
  const writeOffDialog = { open: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };

  function create(): ComponentFixture<TimeReviewComponent> {
    const fixture = TestBed.createComponent(TimeReviewComponent);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ComponentFixture<unknown>, testId: string) =>
    (
      fixture.nativeElement.querySelector(
        `[data-testid="${testId}"]`,
      ) as HTMLElement
    ).textContent;
  const all = (fixture: ComponentFixture<unknown>, testId: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        `[data-testid="${testId}"]`,
      ),
    ) as HTMLElement[];
  const button = (row: HTMLElement, label: string) =>
    Array.from(row.querySelectorAll("button")).find((item) =>
      item.textContent?.includes(label),
    ) as HTMLButtonElement;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    api.review.mockReturnValue(of(review));
    capture.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOffDialog },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string) => key,
            language: () => "SR",
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ date: DATE })),
          },
        },
      ],
    });
  });

  it("loads the review for the requested date and renders three sections", () => {
    const fixture = create();

    expect(api.review).toHaveBeenCalledWith(DATE);
    expect(all(fixture, "today-entry")).toHaveLength(2);
    expect(text(fixture, "section-today")).toContain("time.review.today");
    expect(text(fixture, "section-today")).toContain("1h 30m");
    expect(all(fixture, "proposed-entry")).toHaveLength(1);
    expect(text(fixture, "section-proposed")).toContain("Poziv sa klijentom");
    expect(all(fixture, "missing-event")).toHaveLength(1);
    expect(all(fixture, "untouched-client")).toHaveLength(1);
    expect(text(fixture, "section-missing")).toContain("Sastanak u sudu");
  });

  it("shows an empty state per section", () => {
    api.review.mockReturnValue(
      of({
        entries: [],
        proposed: [],
        missingEvents: [],
        untouchedClients: [],
      }),
    );
    const fixture = create();

    expect(text(fixture, "section-today")).toContain("time.review.todayEmpty");
    expect(text(fixture, "section-proposed")).toContain(
      "time.review.toConfirmEmpty",
    );
    expect(text(fixture, "section-missing")).toContain(
      "time.review.maybeMissingEmpty",
    );
  });

  it("dismisses an item and keeps it hidden after the component is re-created", () => {
    const first = create();
    button(all(first, "missing-event")[0], "time.review.dismiss").click();
    first.detectChanges();

    expect(all(first, "missing-event")).toHaveLength(0);
    expect(all(first, "untouched-client")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(DISMISSED_KEY) as string)).toEqual([
      "event:event-1",
    ]);
    first.destroy();

    const second = create();
    expect(all(second, "missing-event")).toHaveLength(0);

    button(all(second, "untouched-client")[0], "time.review.dismiss").click();
    second.detectChanges();
    expect(all(second, "untouched-client")).toHaveLength(0);
    expect(text(second, "section-missing")).toContain(
      "time.review.maybeMissingEmpty",
    );
  });

  it("still works when localStorage throws", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      const fixture = create();
      expect(all(fixture, "missing-event")).toHaveLength(1);

      button(all(fixture, "missing-event")[0], "time.review.dismiss").click();
      fixture.detectChanges();
      expect(all(fixture, "missing-event")).toHaveLength(0);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("opens the dialog with the proposed entry's values on confirm", () => {
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.confirm").click();

    expect(capture.open).toHaveBeenCalledWith({
      mode: "confirm-timer",
      entryId: "proposed-1",
      clientId: "client-2",
      caseId: "case-9",
      minutes: 45,
      description: "Poziv sa klijentom",
      workDate: DATE,
    });
  });

  it("reloads after a confirmation is saved", () => {
    capture.open.mockReturnValue(of(proposedEntry));
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.confirm").click();

    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it("logs a missing event through the confirm-source dialog", () => {
    const fixture = create();

    button(all(fixture, "missing-event")[0], "time.review.log").click();

    expect(capture.open).toHaveBeenCalledWith({
      mode: "confirm-source",
      source: { sourceType: "EVENT", sourceId: "event-1" },
      clientId: "client-3",
      caseId: undefined,
      description: "Sastanak u sudu",
      minutes: 90,
      workDate: DATE,
    });
  });

  it("logs an untouched client with the client prefilled", () => {
    const fixture = create();

    button(all(fixture, "untouched-client")[0], "time.review.log").click();

    expect(capture.open).toHaveBeenCalledWith({
      mode: "create",
      clientId: "client-4",
      workDate: DATE,
    });
  });

  it("writes off a proposed entry with the entered reason", () => {
    writeOffDialog.open.mockReturnValue(of("Nije za naplatu"));
    api.writeOff.mockReturnValue(
      of({ ...proposedEntry, status: "WRITTEN_OFF" }),
    );
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.writeOff").click();

    expect(api.writeOff).toHaveBeenCalledWith("proposed-1", {
      reason: "Nije za naplatu",
    });
    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it("does not write off when the reason dialog is dismissed", () => {
    writeOffDialog.open.mockReturnValue(of(null));
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.writeOff").click();

    expect(api.writeOff).not.toHaveBeenCalled();
  });

  it("deletes a proposed entry only after confirmation", () => {
    confirmDialog.confirm.mockReturnValue(of(true));
    api.remove.mockReturnValue(of(undefined));
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.delete").click();

    expect(api.remove).toHaveBeenCalledWith("proposed-1");
    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it("keeps the entry when the delete confirmation is declined", () => {
    confirmDialog.confirm.mockReturnValue(of(false));
    const fixture = create();

    button(all(fixture, "proposed-entry")[0], "time.review.delete").click();

    expect(api.remove).not.toHaveBeenCalled();
  });

  it("drops stale review data when a reload fails", () => {
    const fixture = create();
    expect(fixture.componentInstance.review()).not.toBeNull();

    api.review.mockReturnValue(throwError(() => new Error("down")));
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(fixture.componentInstance.review()).toBeNull();
    expect(fixture.componentInstance.error()).toBe(true);
    expect(all(fixture, "today-entry")).toHaveLength(0);
  });
});
