import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { CalendarItem, CalendarSourceType } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCalendar, lucideClock, lucidePencil } from "@ng-icons/lucide";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

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
    const start = new Date(item.startsAt);
    const startStr = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: BELGRADE_TIME_ZONE,
    }).format(start);

    if (item.endsAt) {
      const end = new Date(item.endsAt);
      const endStr = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: BELGRADE_TIME_ZONE,
      }).format(end);
      return `${startStr} – ${endStr}`;
    }
    return startStr;
  }

  sourceLabel(item: CalendarItem): string {
    return `calendar.source.${item.sourceType.toLowerCase()}`;
  }

  statusLabel(status: string): string {
    return `calendar.status.${status.toLowerCase()}`;
  }

  sourceBadgeClass(sourceType: CalendarSourceType): string {
    switch (sourceType) {
      case "EVENT":
        return "bg-primary/10 text-primary border-primary/20";
      case "DEADLINE":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "TASK":
      default:
        return "bg-secondary text-secondary-foreground border-border";
    }
  }

  statusBadgeClass(status: string): string {
    const s = status.toUpperCase();
    if (["COMPLETED", "DONE", "SATISFIED"].includes(s)) {
      return "bg-muted text-muted-foreground border-border";
    }
    if (s === "CANCELLED") {
      return "bg-destructive/10 text-destructive border-destructive/20";
    }
    if (s === "IN_PROGRESS") {
      return "bg-accent text-accent-foreground border-border";
    }
    return "bg-primary/10 text-primary border-primary/20";
  }

  onItemClick(event: Event, item: CalendarItem): void {
    this.itemSelect.emit({ event, item });
  }

  onItemDblClick(event: MouseEvent, item: CalendarItem): void {
    if (item.sourceType === "EVENT") {
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
