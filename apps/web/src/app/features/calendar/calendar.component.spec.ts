import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import {
  CalendarApiClient,
  EventsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { CalendarItem } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { NEVER, of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { CalendarComponent } from "./calendar.component";
import { EventDialogService } from "./event-dialog/event-dialog.service";
import { DeadlineDialogService } from "../work-management/deadline-dialog/deadline-dialog.service";

describe("CalendarComponent", () => {
  const calendarApi = {
    list: jest.fn(() => of({ items: [], nextCursor: null })),
  };
  const deadlineDialog = { open: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    deadlineDialog.open.mockReturnValue(NEVER);

    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        { provide: CalendarApiClient, useValue: calendarApi },
        { provide: EventsApiClient, useValue: { cancel: jest.fn() } },
        {
          provide: ReferencesApiClient,
          useValue: { users: jest.fn(() => of([])) },
        },
        {
          provide: EventDialogService,
          useValue: { open: jest.fn(() => NEVER) },
        },
        { provide: DeadlineDialogService, useValue: deadlineDialog },
        {
          provide: ConfirmDialogService,
          useValue: { confirm: jest.fn(() => of(false)) },
        },
        {
          provide: LocalizationService,
          useValue: { translate: jest.fn((key: string) => key) },
        },
        {
          provide: AuthState,
          useValue: { session: signal(null) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                date: "2026-09-28",
                view: "week",
              }),
            },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    })
      .overrideComponent(CalendarComponent, { set: { template: "" } })
      .compileComponents();
  });

  it("requests events, tasks, and deadlines for the visible range", () => {
    const fixture = TestBed.createComponent(CalendarComponent);

    fixture.componentInstance["loadRange"](false);

    expect(calendarApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceTypes: ["EVENT", "TASK", "DEADLINE"],
      }),
    );
  });

  it("groups date-only and timed obligations under their Belgrade due day", () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;
    const deadline: CalendarItem = {
      calendarId: "DEADLINE:deadline-1",
      sourceType: "DEADLINE",
      sourceId: "deadline-1",
      title: "Rok za žalbu",
      status: "OPEN",
      startsAt: "2026-09-28T08:00:00.000Z",
      endsAt: null,
      date: null,
      timeZone: "Europe/Belgrade",
      case: null,
      client: null,
      responsibleUser: null,
      assigneeUsers: [],
    };
    const task: CalendarItem = {
      calendarId: "TASK:task-1",
      sourceType: "TASK",
      sourceId: "task-1",
      title: "Predati podnesak",
      status: "TODO",
      startsAt: null,
      endsAt: null,
      date: "2026-09-28",
      timeZone: null,
      case: null,
      client: null,
      responsibleUser: null,
      assigneeUsers: [],
    };

    component.items.set([deadline, task]);

    expect(component.obligationItemsForDay("2026-09-28")).toEqual([
      task,
      deadline,
    ]);
    expect(component.weekEventSegments()).toEqual([]);
    expect(component.itemTime(deadline)).toContain("10:00");
  });

  it("opens deadline creation for the selected date and refreshes after save", () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;
    deadlineDialog.open.mockReturnValueOnce(of({ id: "deadline-1" }));
    calendarApi.list.mockClear();

    component.openCreateDeadline("2026-09-30");

    expect(deadlineDialog.open).toHaveBeenCalledWith({
      dueDate: "2026-09-30",
    });
    expect(calendarApi.list).toHaveBeenCalledTimes(1);
  });
});
