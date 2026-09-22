import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  CalendarApiClient,
  CalendarQuery,
  EventsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { CalendarItem, CalendarSourceType } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../shared/utils";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { EventDialogService } from "./event-dialog/event-dialog.service";
import { CalendarEventsListComponent } from "./calendar-events-list/calendar-events-list.component";

type CalendarView = "month" | "week" | "agenda" | "list" | "board";

interface CalendarDay {
  date: string;
  day: number;
  currentMonth: boolean;
  today: boolean;
}

interface WeekEventSegment {
  id: string;
  day: string;
  item: CalendarItem;
  start: number;
  end: number;
  left: number;
  width: number;
  top: number;
  height: number;
}

const BELGRADE_TIME_ZONE = "Europe/Belgrade";
const CALENDAR_HOUR_HEIGHT = 64;
const CALENDAR_MINUTES_PER_DAY = 24 * 60;

function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

@Component({
  selector: "law-calendar",
  standalone: true,
  templateUrl: "./calendar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    TranslatePipe,
    CalendarEventsListComponent,
  ],
  styleUrls: ["./calendar.component.scss"],
})
export class CalendarComponent {
  private readonly api = inject(CalendarApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly referencesApi = inject(ReferencesApiClient);
  private readonly eventDialog = inject(EventDialogService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly search = new FormControl("", { nonNullable: true });
  readonly sourceControl = new FormControl<CalendarSourceType | "">("", {
    nonNullable: true,
  });
  readonly lawyerIdControl = new FormControl("", { nonNullable: true });
  readonly anchor = signal(this.initialDate());
  readonly view = signal<CalendarView>(this.initialView());
  readonly source = signal<CalendarSourceType | "">("");
  readonly lawyerId = signal(
    this.route.snapshot.queryParamMap.get("lawyer") ?? "",
  );
  readonly lawyers = signal<Array<{ id: string; name: string }>>([]);
  readonly sourceOptions: ReadonlyArray<SelectOption<CalendarSourceType | "">> =
    [
      { value: "", label: "calendar.allSources" },
      { value: "EVENT", label: "calendar.source.event" },
      { value: "TASK", label: "calendar.source.task" },
      { value: "DEADLINE", label: "calendar.source.deadline" },
    ];
  readonly sourceItemToString = createSelectItemToString(
    this.sourceOptions,
    (key) => this.localization.translate(key),
  );
  readonly lawyerItemToString = (value: string | null | undefined): string =>
    value
      ? (this.lawyers().find((lawyer) => lawyer.id === value)?.name ?? value)
      : this.localization.translate("calendar.allLawyers");
  readonly includeClosed = signal(false);
  readonly items = signal<CalendarItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly incomplete = signal(false);
  readonly selectedItem = signal<CalendarItem | null>(null);
  readonly itemPopoverPosition = signal({ left: 16, top: 16 });
  readonly eventMenuItem = signal<CalendarItem | null>(null);
  readonly selectedDay = signal<string | null>(dateKey(this.anchor()));
  readonly calendarExpanded = signal(false);
  @ViewChild("scheduleViewport")
  private scheduleViewport?: ElementRef<HTMLElement>;
  private requestSequence = 0;

  readonly today = dateKey(new Date());
  readonly monthDays = computed(() => this.buildMonthDays(this.anchor()));
  readonly miniWeeks = computed(() => {
    const days = this.monthDays();
    return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
      days.slice(index * 7, index * 7 + 7),
    );
  });
  readonly weekDays = computed(() => this.buildWeekDays(this.anchor()));
  readonly hours = Array.from({ length: 24 }, (_, hour) => hour);
  readonly hourHeight = CALENDAR_HOUR_HEIGHT;
  readonly weekHasAllDayItems = computed(() =>
    this.weekDays().some((day) => this.allDayItemsForDay(day.date).length > 0),
  );
  readonly weekEventSegments = computed<WeekEventSegment[]>(() => {
    if (this.view() !== "week") return [];

    const dayMap = new Map(this.weekDays().map((day) => [day.date, day]));
    const segmentsByDay = new Map<string, WeekEventSegment[]>();
    for (const day of this.weekDays()) {
      segmentsByDay.set(day.date, []);
    }

    for (const item of this.filteredItems()) {
      if (!item.startsAt || !item.endsAt) continue;
      const start = new Date(item.startsAt);
      const end = new Date(item.endsAt);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end.getTime() <= start.getTime()
      ) {
        continue;
      }

      const startKey = dateKey(start);
      const endKey = dateKey(end);
      let cursor = startKey;

      while (true) {
        if (dayMap.has(cursor)) {
          const segmentStartMinutes =
            cursor === startKey ? this.belgradeMinutesFromMidnight(start) : 0;
          const segmentEndMinutes =
            cursor === endKey
              ? this.belgradeMinutesFromMidnight(end)
              : CALENDAR_MINUTES_PER_DAY;
          const visibleStart = Math.max(0, segmentStartMinutes);
          const visibleEnd = Math.min(
            CALENDAR_MINUTES_PER_DAY,
            segmentEndMinutes,
          );

          if (visibleEnd > visibleStart) {
            segmentsByDay.get(cursor)?.push({
              id: `${item.calendarId}-${cursor}`,
              day: cursor,
              item,
              start: visibleStart,
              end: visibleEnd,
              left: 0,
              width: 100,
              top: this.minutesToPixels(visibleStart),
              height: this.minutesToPixels(visibleEnd - visibleStart),
            });
          }
        }

        if (cursor === endKey) break;
        cursor = this.addDayKey(cursor, 1);
      }
    }

    const allSegments: WeekEventSegment[] = [];
    for (const [, daySegments] of segmentsByDay.entries()) {
      const sorted = [...daySegments].sort(
        (left, right) => left.start - right.start || left.end - right.end,
      );

      // Assign columns and widths within one connected overlap group only, so a
      // group's column count never inflates the width of unrelated segments
      // elsewhere in the same day.
      const layoutGroup = (group: WeekEventSegment[]): void => {
        const laneEnds: number[] = [];
        const columnOf = new Map<string, number>();
        for (const segment of group) {
          let column = laneEnds.findIndex((end) => end <= segment.start);
          if (column === -1) column = laneEnds.length;
          laneEnds[column] = segment.end;
          columnOf.set(segment.id, column);
        }

        const columnCount = Math.max(1, laneEnds.length);
        const baseWidth = 100 / columnCount;

        for (const segment of group) {
          const ownColumn = columnOf.get(segment.id) ?? 0;
          let spanEnd = ownColumn;
          for (let column = ownColumn + 1; column < columnCount; column++) {
            const conflicts = group.some(
              (other) =>
                columnOf.get(other.id) === column &&
                other.start < segment.end &&
                segment.start < other.end,
            );
            if (conflicts) break;
            spanEnd = column;
          }

          allSegments.push({
            ...segment,
            left: ownColumn * baseWidth,
            width: (spanEnd - ownColumn + 1) * baseWidth,
            top: this.minutesToPixels(segment.start),
            height: this.minutesToPixels(segment.end - segment.start),
          });
        }
      };

      let currentGroup: WeekEventSegment[] = [];
      let groupMaxEnd = -Infinity;
      for (const segment of sorted) {
        if (currentGroup.length === 0 || segment.start < groupMaxEnd) {
          currentGroup.push(segment);
          groupMaxEnd = Math.max(groupMaxEnd, segment.end);
        } else {
          layoutGroup(currentGroup);
          currentGroup = [segment];
          groupMaxEnd = segment.end;
        }
      }
      if (currentGroup.length > 0) layoutGroup(currentGroup);
    }

    return allSegments.sort(
      (left, right) =>
        left.day.localeCompare(right.day) || left.start - right.start,
    );
  });
  readonly visibleFrom = computed(() =>
    this.view() === "month" || this.view() === "list" || this.view() === "board"
      ? (this.monthDays()[0]?.date ?? dateKey(this.anchor()))
      : dateKey(this.viewStart(this.anchor())),
  );
  readonly visibleTo = computed(() =>
    this.view() === "month" || this.view() === "list" || this.view() === "board"
      ? (this.monthDays()[this.monthDays().length - 1]?.date ??
        dateKey(this.anchor()))
      : dateKey(this.viewEnd(this.anchor())),
  );
  readonly rangeLabel = computed(() =>
    this.view() === "week" || this.view() === "agenda"
      ? `${this.weekDays()[0]?.date} - ${this.weekDays()[6]?.date}`
      : new Intl.DateTimeFormat(undefined, {
          month: "long",
          year: "numeric",
        }).format(this.anchor()),
  );
  readonly miniMonthLabel = computed(() =>
    new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(this.anchor()),
  );
  readonly filteredItems = computed(() => {
    const query = this.search.value.trim().toLocaleLowerCase();
    return this.items().filter((item) => {
      if (this.source() && item.sourceType !== this.source()) return false;
      if (this.lawyerId() && item.responsibleUserId !== this.lawyerId()) {
        return false;
      }
      if (
        !this.includeClosed() &&
        ["COMPLETED", "DONE", "CANCELLED", "SATISFIED"].includes(item.status)
      )
        return false;
      return !query || item.title.toLocaleLowerCase().includes(query);
    });
  });

  constructor() {
    effect(() => {
      this.anchor();
      this.view();
      this.source();
      this.lawyerId();
      this.includeClosed();
      this.loadRange();
    });
    effect(() => {
      const next = this.source();
      if (this.sourceControl.value !== next) {
        this.sourceControl.setValue(next, { emitEvent: false });
      }
    });
    effect(() => {
      const next = this.lawyerId();
      if (this.lawyerIdControl.value !== next) {
        this.lawyerIdControl.setValue(next, { emitEvent: false });
      }
    });
    this.sourceControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setSource(value ?? ""));
    this.lawyerIdControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setLawyer(value ?? ""));
    this.search.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.persistUrl());
    this.referencesApi
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((members) =>
        this.lawyers.set(
          members.map((member) => ({
            id: member.userId,
            name:
              [member.user.firstName, member.user.lastName]
                .filter(Boolean)
                .join(" ") || member.user.email,
          })),
        ),
      );
  }

  previous(): void {
    const date = new Date(this.anchor());
    if (this.view() === "week" || this.view() === "agenda")
      date.setDate(date.getDate() - 7);
    else date.setMonth(date.getMonth() - 1);
    this.anchor.set(date);
    this.selectedDay.set(dateKey(date));
    this.persistUrl();
  }

  next(): void {
    const date = new Date(this.anchor());
    if (this.view() === "week" || this.view() === "agenda")
      date.setDate(date.getDate() + 7);
    else date.setMonth(date.getMonth() + 1);
    this.anchor.set(date);
    this.selectedDay.set(dateKey(date));
    this.persistUrl();
  }

  goToday(): void {
    const today = startOfDay(new Date());
    this.anchor.set(today);
    this.selectedDay.set(dateKey(today));
    this.persistUrl();
  }

  setView(view: CalendarView): void {
    this.view.set(view);
    this.persistUrl();
  }

  minutesToPixels(minutes: number): number {
    return (minutes / 60) * this.hourHeight;
  }

  weekSegmentsForDay(day: string): WeekEventSegment[] {
    return this.weekEventSegments().filter((segment) => segment.day === day);
  }

  allDayItemsForDay(day: string): CalendarItem[] {
    // Only genuine date-only items (contract's `date` field) belong here;
    // timed EVENT items always carry startsAt/endsAt and render in the timeline.
    return this.filteredItems().filter((item) => item.date === day);
  }

  eventLabel(item: CalendarItem): string {
    if (!item.startsAt || !item.endsAt) return item.title;
    const start = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: BELGRADE_TIME_ZONE,
    }).format(new Date(item.startsAt));
    const end = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: BELGRADE_TIME_ZONE,
    }).format(new Date(item.endsAt));
    return `${start}–${end} ${item.title}`;
  }

  weekDayDoubleClick(event: MouseEvent, day: string): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-calendar-item-trigger]")) return;
    this.openCreateEvent(day, 9);
  }

  editEvent(event: MouseEvent, item: CalendarItem): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.sourceType !== "EVENT") return;
    this.eventDialog
      .open({ item })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          if (updated) this.loadRange(false);
        },
      });
  }

  toggleCalendarSidebar(): void {
    this.calendarExpanded.set(!this.calendarExpanded());
  }

  setSource(value: string): void {
    this.source.set(value as CalendarSourceType | "");
    this.persistUrl();
  }

  setLawyer(value: string): void {
    this.lawyerId.set(value);
    this.persistUrl();
  }

  setIncludeClosed(value: boolean): void {
    this.includeClosed.set(value);
    this.persistUrl();
  }

  selectDay(date: string): void {
    this.selectedDay.set(date);
  }

  selectMiniDay(date: string): void {
    this.anchor.set(new Date(`${date}T00:00:00`));
    this.selectedDay.set(date);
    this.view.set("week");
    this.persistUrl();
  }

  isSelectedMiniWeek(week: CalendarDay[]): boolean {
    const selected = this.selectedDay() ?? this.today;
    return week.some((day) => day.date === selected);
  }

  selectItem(event: Event, item: CalendarItem): void {
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const width = 360;
    const left = rect
      ? Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8)
      : 16;
    const preferredTop = (rect?.bottom ?? 16) + 8;
    const top = Math.min(preferredTop, Math.max(window.innerHeight - 320, 8));
    this.itemPopoverPosition.set({ left, top });
    this.selectedItem.set(item);
  }

  @HostListener("document:click", ["$event"])
  closePopoverOnOutsideClick(event: MouseEvent): void {
    if (!this.selectedItem()) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(".calendar-item-popover") ||
      target?.closest("[data-calendar-item-trigger]")
    ) {
      return;
    }
    this.selectedItem.set(null);
    this.eventMenuItem.set(null);
  }

  openCreateEvent(date: string, hour = 9): void {
    this.eventDialog
      .open({ date, hour })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          if (event) this.loadRange(false);
        },
      });
  }

  openEventMenu(event: MouseEvent, item: CalendarItem): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.sourceType !== "EVENT") return;
    this.eventMenuItem.set(item);
    this.selectItem(event, item);
  }

  changeEvent(): void {
    const item = this.eventMenuItem();
    if (!item) return;
    this.eventDialog
      .open({ item })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          this.eventMenuItem.set(null);
          if (event) this.loadRange(false);
        },
      });
  }

  cancelEvent(): void {
    const item = this.eventMenuItem();
    if (!item) return;
    this.confirm
      .confirm({
        title: "calendar.deleteEvent",
        message: "calendar.deleteEventDescription",
        confirmText: "calendar.delete",
        cancelText: "common.cancel",
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.eventsApi
          .cancel(item.sourceId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.eventMenuItem.set(null);
              this.selectedItem.set(null);
              this.loadRange(false);
            },
          });
      });
  }

  closeEventMenu(): void {
    this.eventMenuItem.set(null);
  }

  clearFilters(): void {
    this.search.setValue("");
    this.source.set("");
    this.includeClosed.set(false);
    this.persistUrl();
  }

  itemsFor(date: string): CalendarItem[] {
    return this.filteredItems()
      .filter((item) => this.itemDate(item) === date)
      .sort((a, b) => this.sortItems(a, b));
  }

  itemsForHour(date: string, hour: number): CalendarItem[] {
    return this.filteredItems().filter((item) => {
      if (item.sourceType !== "EVENT" || !item.startsAt) return false;
      const startsAt = new Date(item.startsAt);
      return dateKey(startsAt) === date && startsAt.getHours() === hour;
    });
  }

  hourLabel(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
  }

  itemDate(item: CalendarItem): string {
    return item.date ?? item.startsAt?.slice(0, 10) ?? "";
  }

  itemTime(item: CalendarItem): string {
    if (item.date || !item.startsAt) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(item.startsAt));
  }

  sourceLabel(item: CalendarItem): string {
    return `calendar.source.${item.sourceType.toLowerCase()}`;
  }

  statusLabel(status: string): string {
    return `calendar.status.${status.toLowerCase()}`;
  }

  trackItem(_: number, item: CalendarItem): string {
    return item.calendarId;
  }

  private addDayKey(value: string, offset: number): string {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + offset);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  private belgradeMinutesFromMidnight(date: Date): number {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BELGRADE_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    return (
      (values["hour"] ?? 0) * 60 +
      (values["minute"] ?? 0) +
      (values["second"] ?? 0) / 60
    );
  }

  private loadRange(scrollToNow = true): void {
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(false);
    const query: CalendarQuery = {
      from: `${this.visibleFrom()}T00:00:00.000Z`,
      to: `${this.nextDate(this.visibleTo())}T00:00:00.000Z`,
      limit: 100,
      sourceType: "EVENT",
      ...(this.lawyerId() && { userId: this.lawyerId() }),
    };
    this.api
      .list(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (sequence !== this.requestSequence) return;
          this.items.set(response.items);
          this.incomplete.set(Boolean(response.nextCursor));
          this.loading.set(false);
          if (scrollToNow) this.scrollToCurrentHour();
        },
        error: () => {
          if (sequence !== this.requestSequence) return;
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  private persistUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        date: dateKey(this.anchor()),
        view: this.view(),
        search: this.search.value || null,
        source: this.source() || null,
        lawyer: this.lawyerId() || null,
        closed: this.includeClosed() ? "1" : null,
        presentation:
          this.view() === "list" || this.view() === "board"
            ? this.view()
            : null,
      },
    });
  }

  private initialDate(): Date {
    const value = this.route.snapshot.queryParamMap.get("date");
    if (!value) return startOfDay(new Date());
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? startOfDay(new Date()) : parsed;
  }

  private initialView(): CalendarView {
    const value = this.route.snapshot.queryParamMap.get("view");
    if (
      value === "month" ||
      value === "week" ||
      value === "agenda" ||
      value === "list" ||
      value === "board"
    )
      return value;
    return "week";
  }

  private buildMonthDays(anchor: Date): CalendarDay[] {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    first.setDate(first.getDate() - mondayIndex(first));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return {
        date: dateKey(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === anchor.getMonth(),
        today: dateKey(date) === this.today,
      };
    });
  }

  private buildWeekDays(anchor: Date): CalendarDay[] {
    const first = this.viewStart(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return {
        date: dateKey(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === anchor.getMonth(),
        today: dateKey(date) === this.today,
      };
    });
  }

  private viewStart(anchor: Date): Date {
    const date = startOfDay(anchor);
    date.setDate(date.getDate() - mondayIndex(date));
    return date;
  }

  private viewEnd(anchor: Date): Date {
    const date = this.viewStart(anchor);
    date.setDate(
      date.getDate() +
        (this.view() === "week" || this.view() === "agenda" ? 6 : 0),
    );
    return date;
  }

  private nextDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + 1);
    return dateKey(date);
  }

  private sortItems(a: CalendarItem, b: CalendarItem): number {
    const aDateOnly = Boolean(a.date && !a.startsAt);
    const bDateOnly = Boolean(b.date && !b.startsAt);
    if (aDateOnly !== bDateOnly) return aDateOnly ? -1 : 1;
    return (
      (a.startsAt ?? a.date ?? "").localeCompare(b.startsAt ?? b.date ?? "") ||
      a.calendarId.localeCompare(b.calendarId)
    );
  }

  private scrollToCurrentHour(): void {
    if (this.view() !== "week") return;
    requestAnimationFrame(() => {
      const viewport = this.scheduleViewport?.nativeElement;
      if (!viewport) return;
      viewport.scrollTop = Math.max(new Date().getHours() - 1, 0) * 64;
    });
  }
}
