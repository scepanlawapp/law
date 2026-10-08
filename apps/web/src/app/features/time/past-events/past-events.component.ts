import { NgTemplateOutlet } from "@angular/common";
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
import { PastWorkEvent } from "@law/api-interfaces";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronLeft, lucideChevronRight } from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { filter, finalize, switchMap } from "rxjs";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../../shared/status-badge";
import { EventDialogService } from "../../calendar/event-dialog/event-dialog.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";
import { WriteOffDialogService } from "../write-off-dialog/write-off-dialog.service";
import { STATUS_LABEL_KEYS, timeLocale } from "../time-utils";

@Component({
  selector: "law-past-work-events",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    HlmButton,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
    NgIcon,
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
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly collapsibleSidebar = input(false);
  readonly expanded = signal(false);
  readonly totalItems = signal<number | null>(null);
  readonly workChanged = output<void>();
  readonly events = signal<PastWorkEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly busy = signal<string | null>(null);
  readonly page = signal(1);
  readonly totalPages = signal(0);
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

  status(event: PastWorkEvent): string {
    return (
      event.workEntry?.status ??
      (event.writeOffReason ? "WRITTEN_OFF" : "PROPOSED")
    );
  }
  statusLabel(event: PastWorkEvent): string {
    return event.workEntry
      ? STATUS_LABEL_KEYS[event.workEntry.status]
      : event.writeOffReason
        ? "time.status.writtenOff"
        : "time.events.unlogged";
  }
  canLog(event: PastWorkEvent): boolean {
    return (
      !event.writeOffReason &&
      (!event.workEntry ||
        (event.workEntry.status === "PROPOSED" && event.workEntry.canManage))
    );
  }
  canWriteOff(event: PastWorkEvent): boolean {
    return (
      !event.writeOffReason &&
      (!event.workEntry ||
        (event.workEntry.canManage &&
          ["PROPOSED", "CONFIRMED"].includes(event.workEntry.status)))
    );
  }
  load(page = this.page()): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .pastEvents(page, 20)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.events.set(response.items);
          this.page.set(page);
          this.totalPages.set(response.meta.totalPages);
          this.totalItems.set(response.meta.totalItems);
        },
        error: () => this.error.set(true),
      });
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
        next: (saved) => {
          if (saved) this.load();
        },
        error: () => this.showError(),
      });
  }
  logWork(event: PastWorkEvent): void {
    if (this.busy() || !this.canLog(event)) return;
    const minutes = Math.round(
      (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
        60000,
    );
    const workDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Belgrade",
    }).format(new Date(event.startsAt));
    this.capture
      .open({
        mode: "create",
        eventId: event.id,
        clientId: event.clients.length === 1 ? event.clients[0].id : undefined,
        caseId: event.case?.id,
        title: event.title.slice(0, 200),
        description: event.description ?? undefined,
        workDate,
        minutes:
          !event.isAllDay && minutes >= 1 && minutes <= 1440
            ? minutes
            : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) {
          this.load();
          this.workChanged.emit();
        }
      });
  }
  viewWork(event: PastWorkEvent): void {
    if (!event.workEntry?.canManage) return;
    this.capture
      .open({ mode: "view", entryId: event.workEntry.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
  writeOff(event: PastWorkEvent): void {
    if (this.busy() || !this.canWriteOff(event)) return;
    this.busy.set(event.id);
    this.writeOffDialog
      .open()
      .pipe(
        filter((reason): reason is string => !!reason),
        switchMap((reason) => this.api.writeOffEvent(event.id, { reason })),
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.load();
          this.workChanged.emit();
        },
        error: () => this.showError(),
      });
  }
  private showError(): void {
    this.toast.error(this.local.translate("time.events.actionError"));
  }
}
