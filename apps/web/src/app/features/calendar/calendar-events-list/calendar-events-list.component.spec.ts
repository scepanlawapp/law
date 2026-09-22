import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CalendarItem } from "@law/api-interfaces";
import { LocalizationService } from "../../../core/localization/localization.service";
import { CalendarEventsListComponent } from "./calendar-events-list.component";

describe("CalendarEventsListComponent", () => {
  let fixture: ComponentFixture<CalendarEventsListComponent>;
  let component: CalendarEventsListComponent;

  const mockLocalization = {
    translate: jest.fn((key: string) => key),
    language: jest.fn(() => "SR"),
  };

  const sampleItems: CalendarItem[] = [
    {
      calendarId: "cal-2",
      sourceType: "TASK",
      sourceId: "task-1",
      title: "Second Item",
      status: "TODO",
      startsAt: "2026-09-21T14:00:00.000Z",
      endsAt: "2026-09-21T15:00:00.000Z",
      date: null,
      timeZone: "Europe/Belgrade",
      caseId: null,
      clientId: null,
      responsibleUserId: null,
      assigneeUserIds: [],
    },
    {
      calendarId: "cal-1",
      sourceType: "EVENT",
      sourceId: "event-1",
      title: "First Item",
      status: "SCHEDULED",
      startsAt: "2026-09-21T09:00:00.000Z",
      endsAt: "2026-09-21T10:00:00.000Z",
      date: null,
      timeZone: "Europe/Belgrade",
      caseId: "CASE-123",
      clientId: null,
      responsibleUserId: null,
      assigneeUserIds: [],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarEventsListComponent],
      providers: [{ provide: LocalizationService, useValue: mockLocalization }],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarEventsListComponent);
    component = fixture.componentInstance;
  });

  it("renders empty state when no items are provided", () => {
    fixture.componentRef.setInput("items", []);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain("calendar.emptyTitle");
  });

  it("renders items sorted chronologically", () => {
    fixture.componentRef.setInput("items", sampleItems);
    fixture.detectChanges();

    const sorted = component.sortedItems();
    expect(sorted[0].calendarId).toBe("cal-1");
    expect(sorted[1].calendarId).toBe("cal-2");

    const titles = fixture.nativeElement.querySelectorAll("li span");
    expect(titles[0].textContent).toContain("First Item");
  });

  it("emits itemSelect on row click", () => {
    fixture.componentRef.setInput("items", sampleItems);
    fixture.detectChanges();

    const selectSpy = jest.fn();
    component.itemSelect.subscribe(selectSpy);

    const button = fixture.nativeElement.querySelector(
      "li button",
    ) as HTMLButtonElement;
    button.click();

    expect(selectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ calendarId: "cal-1" }),
      }),
    );
  });

  it("emits itemEdit when clicking the edit button on an event", () => {
    fixture.componentRef.setInput("items", sampleItems);
    fixture.detectChanges();

    const editSpy = jest.fn();
    component.itemEdit.subscribe(editSpy);

    const editBtn = fixture.nativeElement.querySelector(
      "button[aria-label='calendar.change']",
    ) as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    editBtn.click();

    expect(editSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ calendarId: "cal-1" }),
      }),
    );
  });
});
