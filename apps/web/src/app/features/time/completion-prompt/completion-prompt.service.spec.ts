import { TestBed } from "@angular/core/testing";
import { WorkEntriesApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { NEVER, of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";
import {
  COMPLETION_PROMPT_TIMEOUT_MS,
  CompletionPromptService,
  eventDefaultMinutes,
} from "./completion-prompt.service";

describe("CompletionPromptService", () => {
  const confirmFromSource = jest.fn();
  const open = jest.fn();
  const success = jest.fn();
  const error = jest.fn();
  let service: CompletionPromptService;

  beforeEach(() => {
    jest.useFakeTimers();
    confirmFromSource.mockReset().mockReturnValue(of({} as WorkEntry));
    open.mockReset().mockReturnValue(NEVER);
    success.mockReset();
    error.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkEntriesApiClient, useValue: { confirmFromSource } },
        { provide: QuickCaptureDialogService, useValue: { open } },
        { provide: ToastService, useValue: { success, error } },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    service = TestBed.inject(CompletionPromptService);
  });

  afterEach(() => jest.useRealTimers());

  const task = {
    sourceType: "TASK",
    sourceId: "task-1",
    title: "Draft",
  } as const;

  it("posts the chosen minutes, shows a success toast and closes", () => {
    service.prompt(task);

    service.confirm(30);

    expect(confirmFromSource).toHaveBeenCalledWith({
      sourceType: "TASK",
      sourceId: "task-1",
      minutes: 30,
    });
    expect(success).toHaveBeenCalledTimes(1);
    expect(service.current()).toBeNull();
  });

  it("shows an error toast and does not retry when saving fails", () => {
    confirmFromSource.mockReturnValue(throwError(() => new Error("nope")));
    service.prompt(task);

    service.confirm(60);

    expect(error).toHaveBeenCalledTimes(1);
    expect(confirmFromSource).toHaveBeenCalledTimes(1);
    expect(service.current()).toBeNull();
  });

  it("posts nothing on skip", () => {
    service.prompt(task);

    service.skip();

    expect(confirmFromSource).not.toHaveBeenCalled();
    expect(service.current()).toBeNull();
  });

  it("opens the capture dialog in confirm-source mode for Other", () => {
    service.prompt({ ...task, sourceType: "EVENT", defaultMinutes: 45 });

    service.other();

    expect(open).toHaveBeenCalledWith({
      mode: "confirm-source",
      source: { sourceType: "EVENT", sourceId: "task-1" },
      minutes: 45,
    });
    expect(confirmFromSource).not.toHaveBeenCalled();
    expect(service.current()).toBeNull();
  });

  it("replaces the previous prompt with a new completion", () => {
    service.prompt(task);
    service.prompt({ ...task, sourceId: "task-2", title: "Next" });

    expect(service.current()?.sourceId).toBe("task-2");
  });

  it("dismisses an untouched prompt after the timeout without posting", () => {
    service.prompt(task);

    jest.advanceTimersByTime(COMPLETION_PROMPT_TIMEOUT_MS - 1);
    expect(service.current()).not.toBeNull();
    jest.advanceTimersByTime(1);

    expect(service.current()).toBeNull();
    expect(confirmFromSource).not.toHaveBeenCalled();
  });

  it("restarts the timeout when a prompt is replaced", () => {
    service.prompt(task);
    jest.advanceTimersByTime(COMPLETION_PROMPT_TIMEOUT_MS - 1000);
    service.prompt({ ...task, sourceId: "task-2" });
    jest.advanceTimersByTime(COMPLETION_PROMPT_TIMEOUT_MS - 1000);

    expect(service.current()?.sourceId).toBe("task-2");
  });
});

describe("eventDefaultMinutes", () => {
  it("returns the duration in minutes for a timed event", () => {
    expect(
      eventDefaultMinutes({
        startsAt: "2026-10-04T09:00:00Z",
        endsAt: "2026-10-04T10:30:00Z",
        isAllDay: false,
      }),
    ).toBe(90);
  });

  it("ignores all-day, missing and out-of-range durations", () => {
    expect(
      eventDefaultMinutes({
        startsAt: "2026-10-04T00:00:00Z",
        endsAt: "2026-10-05T00:00:00Z",
        isAllDay: true,
      }),
    ).toBeUndefined();
    expect(
      eventDefaultMinutes({
        startsAt: "2026-10-04T09:00:00Z",
        endsAt: "not a date",
        isAllDay: false,
      }),
    ).toBeUndefined();
    expect(
      eventDefaultMinutes({
        startsAt: "2026-10-04T09:00:00Z",
        endsAt: "2026-10-06T09:00:00Z",
        isAllDay: false,
      }),
    ).toBeUndefined();
    expect(
      eventDefaultMinutes({
        startsAt: "2026-10-04T09:00:00Z",
        endsAt: "2026-10-04T09:00:00Z",
        isAllDay: false,
      }),
    ).toBeUndefined();
  });
});
