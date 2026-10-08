import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WorkEntriesApiClient, EventsApiClient } from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../../shared/status-badge";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { Subscription, finalize, switchMap } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  formatMinutes,
  formatWorkDate,
  STATUS_LABEL_KEYS,
} from "../../time/time-utils";
import { QuickCaptureDialogService } from "../../time/quick-capture/quick-capture-dialog.service";
import { eventCaptureInput } from "../../time/quick-capture/event-capture";
import { isEditable } from "../../time/time-utils";

@Component({
  selector: "law-event-work-entries",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmSpinner, TranslatePipe],
  template: `
    <section
      class="mt-4 grid gap-3 border-t border-border pt-4"
      [attr.aria-labelledby]="headingId"
    >
      <h3 [id]="headingId" class="text-base font-semibold">
        {{ "work.entries.title" | translate }}
      </h3>
      <button
        hlmBtn
        type="button"
        variant="outline"
        [disabled]="disabled() || opening()"
        (click)="openQuickCapture()"
      >
        {{ "work.addWork" | translate }}
      </button>
      @if (loading()) {
        <hlm-spinner [attr.aria-label]="'work.entries.loading' | translate" />
      }
      @if (error()) {
        <p role="alert" class="text-sm text-destructive">
          {{ "work.entries.error" | translate }}
        </p>
        <button
          hlmBtn
          type="button"
          variant="outline"
          [disabled]="loading()"
          (click)="load(true)"
        >
          {{ "work.retry" | translate }}
        </button>
      } @else if (!loading() && entries().length === 0) {
        <p class="text-sm text-muted-foreground">
          {{ "work.entries.empty" | translate }}
        </p>
      }
      <ul class="grid gap-3">
        @for (entry of entries(); track entry.id) {
          <li>
            <button
              type="button"
              class="grid w-full gap-1 rounded-md border border-border p-3 text-start hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              [disabled]="disabled() || opening()"
              (click)="openWorkEntry(entry)"
            >
              <span class="text-sm font-medium break-words">
                {{ entry.title }}
              </span>
              <span class="text-sm text-muted-foreground">
                {{ dateLabel(entry.workDate) }} · {{ entry.user.displayName }}
              </span>
              <span class="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {{
                    entry.minutes === null
                      ? ("work.entries.untimed" | translate)
                      : formatMinutes(entry.minutes)
                  }}
                </span>
                <span
                  [class]="badgeClasses + ' ' + statusBadgeClass(entry.status)"
                >
                  {{ statusLabels[entry.status] | translate }}
                </span>
              </span>
              @if (entry.description) {
                <span
                  class="text-sm text-muted-foreground whitespace-pre-wrap break-words"
                >
                  {{ entry.description }}
                </span>
              }
            </button>
          </li>
        }
      </ul>
      @if (hasMore() && !error()) {
        <button
          hlmBtn
          type="button"
          variant="outline"
          [disabled]="loading()"
          (click)="load(false)"
        >
          {{ "work.loadMore" | translate }}
        </button>
      }
    </section>
  `,
})
export class EventWorkEntriesComponent {
  private static nextId = 0;
  readonly headingId = `event-work-heading-${EventWorkEntriesComponent.nextId++}`;
  readonly badgeClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly eventId = input.required<string>();
  readonly disabled = input(false);
  readonly entries = signal<WorkEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly hasMore = signal(false);
  readonly opening = signal(false);
  readonly formatMinutes = formatMinutes;
  readonly statusLabels = STATUS_LABEL_KEYS;
  private readonly api = inject(WorkEntriesApiClient);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private page = 0;

  constructor() {
    effect((onCleanup) => {
      this.eventId();
      untracked(() => this.load(true));
      onCleanup(() => this.request?.unsubscribe());
    });
  }

  dateLabel(date: string): string {
    return formatWorkDate(date, this.localization.language());
  }

  load(reset: boolean): void {
    if (!reset && this.loading()) return;
    this.request?.unsubscribe();
    if (reset) {
      this.entries.set([]);
      this.page = 0;
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.error.set(false);
    const page = this.page + 1;
    this.request = this.api
      .list({ eventId: this.eventId(), page, pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.entries.update((entries) => [...entries, ...response.items]);
          this.page = page;
          this.hasMore.set(this.entries().length < response.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  openWorkEntry(entry: WorkEntry): void {
    if (this.opening() || this.disabled()) return;
    this.opening.set(true);
    this.capture
      .open({
        mode: isEditable(entry) ? "edit" : "view",
        entryId: entry.id,
        manageEntry: true,
        onDeleted: () => this.load(true),
      })
      .pipe(
        finalize(() => this.opening.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          if (saved) this.load(true);
        },
        error: () => this.error.set(true),
      });
  }

  openQuickCapture(): void {
    if (this.opening() || this.disabled()) return;
    this.opening.set(true);
    this.eventsApi
      .get(this.eventId())
      .pipe(
        switchMap((event) => this.capture.open(eventCaptureInput(event))),
        finalize(() => this.opening.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          if (saved) this.load(true);
        },
        error: () => this.error.set(true),
      });
  }
}
