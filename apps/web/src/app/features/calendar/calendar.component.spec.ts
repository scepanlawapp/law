import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import {
  CalendarApiClient,
  EventsApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
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
  const workApi = { getDeadline: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    deadlineDialog.open.mockReturnValue(NEVER);
    workApi.getDeadline.mockReturnValue(NEVER);

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
        { provide: WorkManagementApiClient, useValue: workApi },
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
    }).compileComponents();
  });

  it("only offers the sticky obligations toggle when needed and restores entries", () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();

    expect(
      root.querySelector("button[aria-controls^='calendar-obligations-']"),
    ).toBeNull();

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
    const event: CalendarItem = {
      ...task,
      calendarId: "EVENT:event-1",
      sourceType: "EVENT",
      sourceId: "event-1",
      title: "Sastanak",
      startsAt: "2026-09-28T08:00:00.000Z",
      endsAt: "2026-09-28T09:00:00.000Z",
      date: null,
      timeZone: "Europe/Belgrade",
    };
    component.items.set([task, event]);
    fixture.detectChanges();

    const toggle = root.querySelector<HTMLButtonElement>(
      "button[aria-controls^='calendar-obligations-']",
    );
    const obligations = root.querySelector<HTMLElement>(
      "#calendar-obligations-2026-09-28",
    );
    const obligation = obligations?.querySelector("button");
    const timedEvent = root.querySelector<HTMLElement>(".calendar-week-event");
    const eventPosition = timedEvent?.getAttribute("style");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-label")).toBe(
      "calendar.collapseObligations",
    );
    expect(obligation?.textContent).toContain(task.title);
    expect(timedEvent?.textContent).toContain(event.title);

    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-label")).toBe(
      "calendar.expandObligations",
    );
    expect(obligations?.hasAttribute("inert")).toBe(true);
    expect(obligations?.querySelector("button")).toBe(obligation);
    expect(timedEvent?.getAttribute("style")).toBe(eventPosition);

    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(obligations?.hasAttribute("inert")).toBe(false);
    expect(obligations?.querySelector("button")).toBe(obligation);
    expect(timedEvent?.getAttribute("style")).toBe(eventPosition);

    component.items.set([event]);
    fixture.detectChanges();
    expect(
      root.querySelector("button[aria-controls^='calendar-obligations-']"),
    ).toBeNull();
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

  it("sends every selected lawyer to the calendar API", () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;
    component.setLawyerIds(["lawyer-1", "lawyer-2"]);
    calendarApi.list.mockClear();

    component["loadRange"](false);

    expect(calendarApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userIds: ["lawyer-1", "lawyer-2"],
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
    expect(component.weekHasObligationItems()).toBe(true);
    expect(component.obligationsExpanded()).toBe(true);
    expect(component.obligationsToggleLabel()).toBe(
      "calendar.collapseObligations",
    );

    component.toggleObligations();

    expect(component.obligationsExpanded()).toBe(false);
    expect(component.obligationsToggleLabel()).toBe(
      "calendar.expandObligations",
    );
    expect(component.obligationItemsForDay("2026-09-28")).toEqual([
      task,
      deadline,
    ]);
    expect(component.weekHasObligationItems()).toBe(true);
    expect(component.weekEventSegments()).toEqual([]);

    component.toggleObligations();

    expect(component.obligationsExpanded()).toBe(true);
    expect(component.obligationItemsForDay("2026-09-28")).toEqual([
      task,
      deadline,
    ]);
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

  it("loads and opens a deadline for editing, then refreshes after save", () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;
    const deadline = { id: "deadline-1", title: "Rok za žalbu" };
    const item = {
      calendarId: "DEADLINE:deadline-1",
      sourceType: "DEADLINE",
      sourceId: "deadline-1",
      title: "Rok za žalbu",
    } as CalendarItem;
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as MouseEvent;
    workApi.getDeadline.mockReturnValueOnce(of(deadline));
    deadlineDialog.open.mockReturnValueOnce(of(deadline));
    calendarApi.list.mockClear();

    component.editEvent(event, item);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(workApi.getDeadline).toHaveBeenCalledWith("deadline-1");
    expect(deadlineDialog.open).toHaveBeenCalledWith({ deadline });
    expect(calendarApi.list).toHaveBeenCalledTimes(1);
  });
});
