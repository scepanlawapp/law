import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { NotificationsStore } from "../../core/notifications/notifications.store";
import { EventDialogService } from "../../features/calendar/event-dialog/event-dialog.service";
import { QuickCaptureDialogService } from "../../features/time/quick-capture/quick-capture-dialog.service";
import { TaskDialogService } from "../../features/work-management/task-dialog/task-dialog.service";
import { todayDateInputValue } from "../../features/work-management/work-management-utils";
import { HeaderComponent } from "./header.component";

describe("HeaderComponent", () => {
  const quickCapture = { open: jest.fn(() => of(undefined)) };
  const taskDialog = { open: jest.fn(() => of(undefined)) };
  const eventDialog = { open: jest.fn(() => of(undefined)) };

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: LocalizationService,
          useValue: {
            language: signal("SR"),
            translate: jest.fn((key: string) => key),
          },
        },
        {
          provide: NotificationsStore,
          useValue: { unreadCount: signal(0) },
        },
        { provide: QuickCaptureDialogService, useValue: quickCapture },
        { provide: TaskDialogService, useValue: taskDialog },
        { provide: EventDialogService, useValue: eventDialog },
      ],
    })
      .overrideComponent(HeaderComponent, { set: { template: "" } })
      .compileComponents();
  });

  it("opens the task dialog in create mode", () => {
    const fixture = TestBed.createComponent(HeaderComponent);

    fixture.componentInstance.openCreateTask();

    expect(taskDialog.open).toHaveBeenCalledWith({});
  });

  it("opens the event dialog for today", () => {
    const fixture = TestBed.createComponent(HeaderComponent);

    fixture.componentInstance.openCreateEvent();

    expect(eventDialog.open).toHaveBeenCalledWith({
      date: todayDateInputValue(),
      hour: 9,
    });
  });

  it("keeps the existing work-capture action", () => {
    const fixture = TestBed.createComponent(HeaderComponent);

    fixture.componentInstance.openQuickCapture();

    expect(quickCapture.open).toHaveBeenCalledWith({ mode: "create" });
  });
});
