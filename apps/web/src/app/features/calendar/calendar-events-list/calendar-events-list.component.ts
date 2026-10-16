import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import {
  CalendarItem,
  CalendarSourceType,
  EventStatus,
  TaskStatus,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCalendar, lucideClock, lucidePencil } from "@ng-icons/lucide";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import {
  CALENDAR_ITEM_STATUS_LABELS,
  CALENDAR_SOURCE_TYPE_LABELS,
  CLOSED_CALENDAR_ITEM_STATUSES,
  CalendarItemStatus,
  OFFICE_TIME_ZONE,
  labelOf,
} from "../../../shared/models";

const MUTED_BADGE = "bg-muted text-muted-foreground border-border";
const DESTRUCTIVE_BADGE =
  "bg-destructive/10 text-destructive border-destructive/20";
const PRIMARY_BADGE = "bg-primary/10 text-primary border-primary/20";

@Component({
  selector: "law-calendar-events-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmSpinner, NgIcon, TranslatePipe],
  providers: [provideIcons({ lucideCalendar, lucideClock, lucidePencil })],
  templateUrl: "./calendar-events-list.component.html",
  host: {
    class: "block h-full min-h-0 min-w-0 overflow-hidden",
  },
})
export class CalendarEventsListComponent {
  private readonly localization = inject(LocalizationService);
  readonly CalendarSourceType = CalendarSourceType;

  readonly items = input<CalendarItem[]>([]);
  readonly loading = input<boolean>(false);
  readonly selectedItem = input<CalendarItem | null>(null);
  readonly emptyTitle = input<string | null>(null);
  readonly emptyDescription = input<string | null>(null);

  readonly itemSelect = output<{ event: Event; item: CalendarItem }>();
  readonly itemEdit = output<{ event: MouseEvent; item: CalendarItem }>();
  readonly itemContextMenu = output<{
    event: MouseEvent;
    item: CalendarItem;
  }>();

  readonly sortedItems = computed(() => {
    const list = [...this.items()];
    return list.sort((a, b) => {
      const aDate = a.date ?? a.startsAt?.slice(0, 10) ?? "";
      const bDate = b.date ?? b.startsAt?.slice(0, 10) ?? "";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      if (!a.startsAt && b.startsAt) return -1;
      if (a.startsAt && !b.startsAt) return 1;
      if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
      return a.title.localeCompare(b.title);
    });
  });

  formatDate(item: CalendarItem): string {
    const rawDate = item.date ?? item.startsAt?.slice(0, 10);
    if (!rawDate) return "";
    const [year, month, day] = rawDate.split("-");
    if (!year || !month || !day) return rawDate;
    return `${day}.${month}.${year}.`;
  }

  formatTime(item: CalendarItem): string {
    if (item.date || !item.startsAt) {
      return this.localization.translate("calendar.allDay");
    }
    const startStr = this.formatClock(item.startsAt);
    return item.endsAt
      ? `${startStr} – ${this.formatClock(item.endsAt)}`
      : startStr;
  }

  private formatClock(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: OFFICE_TIME_ZONE,
    }).format(new Date(value));
  }

  sourceLabel(item: CalendarItem): string {
    return labelOf(CALENDAR_SOURCE_TYPE_LABELS, item.sourceType, (key) =>
      this.localization.translate(key),
    );
  }

  statusLabel(status: string): string {
    return labelOf(CALENDAR_ITEM_STATUS_LABELS, status, (key) =>
      this.localization.translate(key),
    );
  }

  sourceBadgeClass(sourceType: CalendarSourceType): string {
    switch (sourceType) {
      case CalendarSourceType.EVENT:
        return PRIMARY_BADGE;
      case CalendarSourceType.DEADLINE:
        return DESTRUCTIVE_BADGE;
      case CalendarSourceType.TASK:
      default:
        return "bg-secondary text-secondary-foreground border-border";
    }
  }

  statusBadgeClass(status: string): string {
    const value = status.toUpperCase() as CalendarItemStatus;
    if (value === EventStatus.CANCELLED) return DESTRUCTIVE_BADGE;
    if (CLOSED_CALENDAR_ITEM_STATUSES.includes(value)) return MUTED_BADGE;
    if (value === TaskStatus.IN_PROGRESS) {
      return "bg-accent text-accent-foreground border-border";
    }
    return PRIMARY_BADGE;
  }

  onItemClick(event: Event, item: CalendarItem): void {
    this.itemSelect.emit({ event, item });
  }

  onItemDblClick(event: MouseEvent, item: CalendarItem): void {
    if (item.sourceType === CalendarSourceType.EVENT) {
      this.itemEdit.emit({ event, item });
    } else {
      this.itemSelect.emit({ event, item });
    }
  }

  onItemContextMenu(event: MouseEvent, item: CalendarItem): void {
    this.itemContextMenu.emit({ event, item });
  }

  onEditClick(event: MouseEvent, item: CalendarItem): void {
    event.stopPropagation();
    this.itemEdit.emit({ event, item });
  }
}
