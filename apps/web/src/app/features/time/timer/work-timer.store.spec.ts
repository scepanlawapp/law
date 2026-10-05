import { TestBed } from "@angular/core/testing";
import { WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";
import { formatElapsed, WorkTimerStore } from "./work-timer.store";

function entry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: "entry-1",
    user: { id: "user-1", displayName: "Ana", email: null },
    client: {
      id: "client-1",
      clientNumber: "K-1",
      type: "COMPANY",
      displayName: "Telenor",
      status: "ACTIVE",
    },
    case: null,
    workDate: "2026-10-04",
    minutes: null,
    timerStartedAt: "2026-10-04T09:59:00.000Z",
    title: "",
    description: "",
    serviceCategory: null,
    treatment: "UNDECIDED",
    status: "RUNNING",
    writeOffReason: null,
    source: "TIMER",
    sourceType: null,
    sourceId: null,
    invoiceId: null,
    aiParsed: false,
    createdAt: "2026-10-04T09:59:00.000Z",
    updatedAt: "2026-10-04T09:59:00.000Z",
    ...overrides,
  };
}

describe("WorkTimerStore", () => {
  const api = {
    runningTimer: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
  };
  const dialog = { open: jest.fn() };
  const toast = { error: jest.fn() };

  function create(): WorkTimerStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: QuickCaptureDialogService, useValue: dialog },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: jest.fn((key: string) => key) },
        },
      ],
    });
    return TestBed.inject(WorkTimerStore);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it("is idle when no timer is running", () => {
    api.runningTimer.mockReturnValue(of(null));
    const store = create();
    store.load();
    expect(store.running()).toBeNull();
    expect(store.elapsedSeconds()).toBe(0);
  });

  it("ticks elapsedSeconds from timerStartedAt every second", () => {
    api.runningTimer.mockReturnValue(of(entry()));
    const store = create();
    store.load();

    expect(store.running()?.id).toBe("entry-1");
    expect(store.elapsedSeconds()).toBe(60);
    jest.advanceTimersByTime(3000);
    expect(store.elapsedSeconds()).toBe(63);
  });

  it("starts a timer through the API", () => {
    api.startTimer.mockReturnValue(of(entry()));
    const store = create();
    store.start({ clientId: "client-1" });

    expect(api.startTimer).toHaveBeenCalledWith({ clientId: "client-1" });
    expect(store.running()?.client.displayName).toBe("Telenor");
    expect(store.elapsedSeconds()).toBe(60);
  });

  it("stop() stops the timer and opens the dialog in confirm-timer mode", () => {
    const stopped = entry({ minutes: 1, timerStartedAt: null });
    api.runningTimer.mockReturnValue(of(entry()));
    api.stopTimer.mockReturnValue(of(stopped));
    dialog.open.mockReturnValue(of(entry({ status: "CONFIRMED", minutes: 1 })));
    const store = create();
    store.load();
    store.stop();

    expect(api.stopTimer).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith({
      mode: "confirm-timer",
      entryId: "entry-1",
      clientId: "client-1",
      caseId: undefined,
      minutes: 1,
      requireMinutes: true,
      title: undefined,
      description: undefined,
      workDate: "2026-10-04",
    });
    expect(store.running()).toBeNull();
    expect(store.elapsedSeconds()).toBe(0);
    // The interval is gone: nothing keeps ticking after the entry is confirmed.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("keeps the stopped entry pending when the confirm dialog is dismissed", () => {
    const stopped = entry({ minutes: 2, timerStartedAt: null });
    api.runningTimer.mockReturnValue(of(entry()));
    api.stopTimer.mockReturnValue(of(stopped));
    dialog.open.mockReturnValue(of(null));
    const store = create();
    store.load();
    store.stop();

    expect(store.running()?.timerStartedAt).toBeNull();
    expect(store.elapsedSeconds()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);

    // A second stop only reopens the dialog; the API timer is already stopped.
    api.stopTimer.mockClear();
    store.stop();
    expect(api.stopTimer).not.toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledTimes(2);
  });

  it("formats elapsed time as hh:mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
    expect(formatElapsed(3725)).toBe("01:02:05");
  });
});
