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
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { EventDialogService } from "./event-dialog/event-dialog.service";

type CalendarView = "month" | "week" | "agenda";

interface CalendarDay {
  date: string;
  day: number;
  currentMonth: boolean;
  today: boolean;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

@Component({
  selector: "app-calendar",
  standalone: true,
  templateUrl: "./calendar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmSpinner,
    TranslatePipe,
  ],
})
export class CalendarComponent {
  private readonly api = inject(CalendarApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly referencesApi = inject(ReferencesApiClient);
  private readonly eventDialog = inject(EventDialogService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly search = new FormControl("", { nonNullable: true });
  readonly anchor = signal(this.initialDate());
  readonly view = signal<CalendarView>(this.initialView());
  readonly source = signal<CalendarSourceType | "">("");
  readonly lawyerId = signal(
    this.route.snapshot.queryParamMap.get("lawyer") ?? "",
  );
  readonly lawyers = signal<Array<{ id: string; name: string }>>([]);
  readonly includeClosed = signal(false);
  readonly items = signal<CalendarItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly incomplete = signal(false);
  readonly selectedItem = signal<CalendarItem | null>(null);
  readonly itemPopoverPosition = signal({ left: 16, top: 16 });
  readonly eventMenuItem = signal<CalendarItem | null>(null);
  readonly selectedDay = signal<string | null>(dateKey(this.anchor()));
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
  readonly visibleFrom = computed(() =>
    this.view() === "month"
      ? (this.monthDays()[0]?.date ?? dateKey(this.anchor()))
      : dateKey(this.viewStart(this.anchor())),
  );
  readonly visibleTo = computed(() =>
    this.view() === "month"
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
          if (event) this.loadRange();
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
          if (event) this.loadRange();
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
              this.loadRange();
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

  private loadRange(): void {
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(false);
    const query: CalendarQuery = {
      from: `${this.visibleFrom()}T00:00:00.000Z`,
      to: `${this.nextDate(this.visibleTo())}T00:00:00.000Z`,
      limit: 100,
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
          this.scrollToCurrentHour();
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
    if (value === "month" || value === "week" || value === "agenda")
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
