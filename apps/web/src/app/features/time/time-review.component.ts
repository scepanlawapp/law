import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { WorkEntriesApiClient } from "@law/api-clients";
import { TimeReviewResponse, WorkEntry } from "@law/api-interfaces";
import { Observable } from "rxjs";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import {
  OFFICE_TIME_ZONE,
  STATUS_BADGE_CLASSES,
  STATUS_LABEL_KEYS,
  formatMinutes,
  isEditable,
  isIsoDate,
  minutesBetween,
  officeToday,
  sumMinutes,
} from "./time-utils";
import { WriteOffDialogService } from "./write-off-dialog/write-off-dialog.service";

type MissingEvent = TimeReviewResponse["missingEvents"][number];
type UntouchedClient = TimeReviewResponse["untouchedClients"][number];

const DISMISSED_KEY_PREFIX = "time-review-dismissed:";

const eventDismissKey = (eventId: string) => `event:${eventId}`;
const clientDismissKey = (clientId: string) => `client:${clientId}`;

function readDismissed(date: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DISMISSED_KEY_PREFIX + date) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeDismissed(date: string, keys: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY_PREFIX + date, JSON.stringify(keys));
  } catch {
    // Storage may be unavailable; the dismissal then only lasts for this view.
  }
}

@Component({
  selector: "law-time-review",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmSpinner, TranslatePipe],
  templateUrl: "./time-review.component.html",
})
export class TimeReviewComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly statusBadgeClasses = STATUS_BADGE_CLASSES;
  readonly formatMinutes = formatMinutes;
  readonly isEditable = isEditable;

  readonly date = signal(officeToday());
  readonly review = signal<TimeReviewResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly busyEntryId = signal<string | null>(null);
  private readonly dismissed = signal<string[]>([]);

  readonly entries = computed(() => this.review()?.entries ?? []);
  readonly proposed = computed(() => this.review()?.proposed ?? []);
  readonly totalMinutes = computed(() => sumMinutes(this.entries()));

  readonly missingEvents = computed(() =>
    (this.review()?.missingEvents ?? []).filter(
      (item) => !this.dismissed().includes(eventDismissKey(item.eventId)),
    ),
  );
  readonly untouchedClients = computed(() =>
    (this.review()?.untouchedClients ?? []).filter(
      (item) => !this.dismissed().includes(clientDismissKey(item.client.id)),
    ),
  );
  readonly hasMissing = computed(
    () => this.missingEvents().length + this.untouchedClients().length > 0,
  );

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const requested = params.get("date");
        const date = isIsoDate(requested) ? requested : officeToday();
        this.date.set(date);
        this.dismissed.set(readDismissed(date));
        this.load();
      });
  }

  reload(): void {
    this.load();
  }

  dateLabel(): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en-GB" : "sr-Latn",
      {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      },
    ).format(new Date(`${this.date()}T00:00:00Z`));
  }

  timeRange(item: MissingEvent): string {
    const format = new Intl.DateTimeFormat("sr-Latn", {
      timeZone: OFFICE_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${format.format(new Date(item.startsAt))} – ${format.format(new Date(item.endsAt))}`;
  }

  reasonKey(reason: UntouchedClient["reasons"][number]): string {
    return `time.review.reason.${reason.toLowerCase()}`;
  }

  // ---------------------------------------------------------- entry actions

  edit(entry: WorkEntry): void {
    if (!isEditable(entry)) return;
    this.capture
      .open({ mode: "edit", entryId: entry.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  confirm(entry: WorkEntry): void {
    this.capture
      .open({
        mode: "confirm-timer",
        entryId: entry.id,
        clientId: entry.client.id,
        caseId: entry.case?.id,
        minutes: entry.minutes ?? undefined,
        description: entry.description,
        workDate: entry.workDate,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  writeOff(entry: WorkEntry): void {
    this.writeOffDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reason) => {
        if (!reason) return;
        this.runEntryAction(
          entry,
          this.api.writeOff(entry.id, { reason }),
          "time.writeOff.done",
          "time.writeOff.error",
        );
      });
  }

  remove(entry: WorkEntry): void {
    this.confirmDialog
      .confirm({
        title: "time.review.deleteTitle",
        message: "time.review.deleteMessage",
        confirmText: "time.review.delete",
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.runEntryAction(
          entry,
          this.api.remove(entry.id),
          "time.review.deleted",
          "time.review.deleteError",
        );
      });
  }

  // ------------------------------------------------------- missing hints

  logEvent(item: MissingEvent): void {
    this.capture
      .open({
        mode: "confirm-source",
        source: { sourceType: "EVENT", sourceId: item.eventId },
        clientId: item.client?.id,
        caseId: item.case?.id,
        description: item.title,
        minutes: minutesBetween(item.startsAt, item.endsAt),
        workDate: this.date(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  logClient(item: UntouchedClient): void {
    this.capture
      .open({ mode: "create", clientId: item.client.id, workDate: this.date() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  dismissEvent(item: MissingEvent): void {
    this.dismiss(eventDismissKey(item.eventId));
  }

  dismissClient(item: UntouchedClient): void {
    this.dismiss(clientDismissKey(item.client.id));
  }

  // -------------------------------------------------------------- private

  private dismiss(key: string): void {
    const next = [...new Set([...this.dismissed(), key])];
    this.dismissed.set(next);
    writeDismissed(this.date(), next);
  }

  private runEntryAction(
    entry: WorkEntry,
    request: Observable<unknown>,
    successKey: string,
    errorKey: string,
  ): void {
    this.busyEntryId.set(entry.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busyEntryId.set(null);
        this.toast.success(this.localization.translate(successKey));
        this.load();
      },
      error: () => {
        this.busyEntryId.set(null);
        this.toast.error(this.localization.translate(errorKey));
      },
    });
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .review(this.date())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          if (requestId !== this.requestId) return;
          this.review.set(review);
          this.loading.set(false);
        },
        error: () => {
          if (requestId !== this.requestId) return;
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
