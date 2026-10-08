import { TestBed } from "@angular/core/testing";
import { EventsApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { PastWorkEvent } from "@law/api-interfaces";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { EventDialogService } from "../../calendar/event-dialog/event-dialog.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";
import { WriteOffDialogService } from "../write-off-dialog/write-off-dialog.service";
import { PastEventsComponent } from "./past-events.component";

const event: PastWorkEvent = {
  hasWorkEntry: false,
  id: "event-1",
  type: "HEARING",
  title: "Hearing – Petrović",
  description: "Prepare the appeal",
  startsAt: "2026-10-01T08:00:00Z",
  endsAt: "2026-10-01T09:00:00Z",
  isAllDay: false,
  clients: [
    {
      id: "client-1",
      displayName: "Petrović",
      clientNumber: "C1",
      type: "INDIVIDUAL",
      status: "ACTIVE",
    },
  ],
  case: {
    id: "case-1",
    caseNumber: "P-234",
    name: "Appeal",
    status: "ACTIVE",
    priority: "NORMAL",
  },
  workEntry: null,
  writeOffReason: null,
};

describe("PastEventsComponent", () => {
  const api = { pastEvents: jest.fn(), writeOffEvent: jest.fn() };
  const events = { get: jest.fn() };
  const dialog = { open: jest.fn() };
  const capture = { open: jest.fn() };
  const writeOff = { open: jest.fn() };
  const toast = { error: jest.fn() };
  function render() {
    const fixture = TestBed.createComponent(PastEventsComponent);
    fixture.detectChanges();
    return fixture;
  }
  beforeEach(() => {
    jest.resetAllMocks();
    api.pastEvents.mockReturnValue(
      of({ items: [event], meta: { totalPages: 2 } }),
    );
    api.writeOffEvent.mockReturnValue(of(undefined));
    events.get.mockReturnValue(of(event));
    dialog.open.mockReturnValue(of(undefined));
    capture.open.mockReturnValue(of(null));
    writeOff.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: EventsApiClient, useValue: events },
        { provide: EventDialogService, useValue: dialog },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOff },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "EN" },
        },
      ],
    });
  });
  it("prefills capture and keeps the event unlogged when dismissed", () => {
    const fixture = render();
    fixture.componentInstance.logWork(event);
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        eventId: "event-1",
        clientId: "client-1",
        caseId: "case-1",
        title: event.title,
        description: event.description,
        minutes: 60,
        workDate: "2026-10-01",
      }),
    );
    expect(api.pastEvents).toHaveBeenCalledTimes(1);
  });
  it("requires a client choice when the event has multiple clients", () => {
    const fixture = render();
    fixture.componentInstance.logWork({
      ...event,
      case: null,
      clients: [event.clients[0], { ...event.clients[0], id: "client-2" }],
    });
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: undefined }),
    );
  });
  it("does not invent a duration for all-day events", () => {
    const fixture = render();
    fixture.componentInstance.logWork({ ...event, isAllDay: true });
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({ minutes: undefined }),
    );
  });
  it("opens the current event record in the event dialog", () => {
    const fixture = render();
    fixture.componentInstance.viewEvent(event);
    expect(events.get).toHaveBeenCalledWith("event-1");
    expect(dialog.open).toHaveBeenCalledWith({ event });
  });
  it("writes off directly without a reason dialog", () => {
    const fixture = render();
    fixture.componentInstance.writeOff(event);
    expect(api.writeOffEvent).toHaveBeenCalledWith("event-1");
    expect(writeOff.open).not.toHaveBeenCalled();
    expect(api.pastEvents).toHaveBeenCalledTimes(2);
  });
  it("asks only for missing client data with non-billable capture preselected", () => {
    const fixture = render();
    fixture.componentInstance.writeOff({ ...event, case: null, clients: [] });
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.id, treatment: "NON_BILLABLE" }),
    );
    expect(writeOff.open).not.toHaveBeenCalled();
    expect(api.writeOffEvent).not.toHaveBeenCalled();
  });
  it("does not allow duplicate capture or writing off billed work", () => {
    const fixture = render();
    const billed: PastWorkEvent = {
      ...event,
      hasWorkEntry: true,
      workEntry: { id: "entry-1", status: "BILLED", canManage: true },
    };
    fixture.componentInstance.logWork(billed);
    fixture.componentInstance.writeOff(billed);
    expect(capture.open).not.toHaveBeenCalled();
    expect(writeOff.open).not.toHaveBeenCalled();
  });
  it("shows event cards and paginates", () => {
    const fixture = render();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("article")).not.toBeNull();
    fixture.componentInstance.load(2);
    expect(api.pastEvents).toHaveBeenLastCalledWith(2, 20);
  });
  it("shows a retryable error", () => {
    api.pastEvents.mockReturnValueOnce(throwError(() => new Error("Offline")));
    const fixture = render();
    expect(fixture.nativeElement.textContent).toContain(
      "time.events.loadError",
    );
    fixture.componentInstance.load();
    expect(fixture.componentInstance.error()).toBe(false);
  });
});
