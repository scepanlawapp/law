import { TestBed } from "@angular/core/testing";
import { EventsApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { QuickCaptureDialogService } from "../../time/quick-capture/quick-capture-dialog.service";
import { EventWorkEntriesComponent } from "./event-work-entries.component";

describe("EventWorkEntriesComponent", () => {
  const api = { list: jest.fn() },
    events = { get: jest.fn() },
    capture = { open: jest.fn() };
  const entry = {
    id: "w1",
    title: "Work",
    user: { displayName: "Ana" },
    workDate: "2026-10-01",
    minutes: 60,
    status: "CONFIRMED",
    description: "Notes",
  } as WorkEntry;
  beforeEach(() => {
    jest.resetAllMocks();
    api.list.mockReturnValue(of({ items: [entry], meta: { totalItems: 1 } }));
    events.get.mockReturnValue(
      of({
        id: "e1",
        title: "Meeting",
        description: "Notes",
        clients: [{ id: "c1" }],
        case: null,
        startsAt: "2026-10-01T08:00:00Z",
        endsAt: "2026-10-01T09:00:00Z",
        isAllDay: false,
      }),
    );
    capture.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: EventsApiClient, useValue: events },
        { provide: QuickCaptureDialogService, useValue: capture },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "EN" },
        },
      ],
    });
  });
  function render() {
    const fixture = TestBed.createComponent(EventWorkEntriesComponent);
    fixture.componentRef.setInput("eventId", "e1");
    fixture.detectChanges();
    return fixture;
  }
  it("loads event work and can add another entry with current event defaults", () => {
    const fixture = render();
    capture.open.mockReturnValue(of(entry));
    fixture.componentInstance.openQuickCapture();
    expect(api.list).toHaveBeenCalledWith({
      eventId: "e1",
      page: 1,
      pageSize: 50,
    });
    expect(events.get).toHaveBeenCalledWith("e1");
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "e1",
        clientId: "c1",
        title: "Meeting",
        minutes: 60,
      }),
    );
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it.each(["BILLED", "RUNNING"])("opens %s work read-only", (status) => {
    const fixture = render();
    fixture.componentInstance.openWorkEntry({
      ...entry,
      status: status as WorkEntry["status"],
    });
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "w1", mode: "view" }),
    );
  });
  it("opens editable work and refreshes after deletion", () => {
    const fixture = render();
    (
      fixture.nativeElement.querySelector("li button") as HTMLButtonElement
    ).click();
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "w1",
        mode: "edit",
        manageEntry: true,
      }),
    );
    capture.open.mock.calls[0][0].onDeleted();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it("loads additional work pages without losing earlier entries", () => {
    api.list.mockReturnValueOnce(
      of({ items: [entry], meta: { totalItems: 2 } }),
    );
    const fixture = render();
    api.list.mockReturnValueOnce(
      of({ items: [{ ...entry, id: "w2" }], meta: { totalItems: 2 } }),
    );
    fixture.componentInstance.load(false);
    expect(fixture.componentInstance.entries().map((item) => item.id)).toEqual([
      "w1",
      "w2",
    ]);
    expect(fixture.componentInstance.hasMore()).toBe(false);
  });
});
