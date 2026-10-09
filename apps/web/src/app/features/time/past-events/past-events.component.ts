import { HttpErrorResponse } from "@angular/common/http";
import { DOCUMENT, NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EventsApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { PastWorkEvent, WorkEntryTreatment } from "@law/api-interfaces";
import { provideIcons } from "@ng-icons/core";
import { lucideChevronLeft, lucideChevronRight } from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { PaginationComponent } from "../../../shared/ui/pagination/pagination.component";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { finalize, switchMap } from "rxjs";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../../shared/status-badge";
import { EventDialogService } from "../../calendar/event-dialog/event-dialog.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";
import { eventCaptureInput } from "../quick-capture/event-capture";
import { timeLocale } from "../time-utils";

@Component({
  selector: "law-past-work-events",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    HlmButton,
    PaginationComponent,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
    HlmTooltip,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  host: {
    "[attr.data-sidebar]": "collapsibleSidebar()",
    "[attr.data-expanded]": "expanded()",
  },
  templateUrl: "./past-events.component.html",
  styleUrl: "./past-events.component.scss",
})
export class PastEventsComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly eventDialog = inject(EventDialogService);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly collapsibleSidebar = input(false);
  readonly expanded = signal(
    inject(DOCUMENT).defaultView?.matchMedia?.("(min-width: 1600px)")
      ?.matches ?? false,
  );
  readonly totalItems = signal<number | null>(null);
  readonly workChanged = output<void>();
  readonly events = signal<PastWorkEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly busy = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly totalPages = signal(0);
  private requestSequence = 0;
  readonly badgeBase = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  constructor() {
    this.load();
  }

  eventTime(event: PastWorkEvent): string {
    const format = new Intl.DateTimeFormat(timeLocale(this.local.language()), {
      timeZone: "Europe/Belgrade",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(!event.isAllDay
        ? { hour: "2-digit" as const, minute: "2-digit" as const }
        : {}),
    });
    return `${format.format(new Date(event.startsAt))} – ${format.format(new Date(event.endsAt))}`;
  }

  canLog(event: PastWorkEvent): boolean {
    return !event.hasWorkEntry;
  }
  canWriteOff(event: PastWorkEvent): boolean {
    return !event.hasWorkEntry;
  }
  load(page = this.page()): void {
    if (this.loading()) return;
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .pastEvents(page, this.pageSize())
      .pipe(
        finalize(() => {
          if (sequence === this.requestSequence) this.loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const lastPage = Math.max(1, response.meta.totalPages);
          if (page > lastPage) {
            this.loading.set(false);
            this.load(lastPage);
            return;
          }
          if (this.totalItems() === null && response.items.length === 0) {
            this.expanded.set(false);
          }
          this.events.set(response.items);
          this.page.set(page);
          this.totalPages.set(response.meta.totalPages);
          this.totalItems.set(response.meta.totalItems);
        },
        error: () => this.error.set(true),
      });
  }
  changePageSize(pageSize: number): void {
    if (this.loading() || pageSize === this.pageSize()) return;
    this.pageSize.set(pageSize);
    this.load(1);
  }
  viewEvent(event: PastWorkEvent): void {
    if (this.busy()) return;
    this.busy.set(event.id);
    this.eventsApi
      .get(event.id)
      .pipe(
        switchMap((event) => this.eventDialog.open({ event })),
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.load(1);
          this.workChanged.emit();
        },
        error: () => this.showError(),
      });
  }
  logWork(event: PastWorkEvent, treatment?: WorkEntryTreatment): void {
    if (this.busy() || !this.canLog(event)) return;
    this.busy.set(event.id);
    this.capture
      .open(eventCaptureInput(event, treatment))
      .pipe(
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          if (saved) {
            this.load(1);
            this.workChanged.emit();
          }
        },
        error: () => this.showError(),
      });
  }
  writeOff(event: PastWorkEvent): void {
    if (this.busy() || !this.canWriteOff(event)) return;
    this.busy.set(event.id);
    this.api
      .writeOffEvent(event.id)
      .pipe(
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.load(1);
          this.workChanged.emit();
        },
        error: (error: HttpErrorResponse) => {
          if (error.error?.code === "EVENT_CLIENT_REQUIRED")
            this.toast.info(this.local.translate("time.events.clientRequired"));
          else this.showError();
        },
      });
  }
  private showError(): void {
    this.toast.error(this.local.translate("time.events.actionError"));
  }
}
