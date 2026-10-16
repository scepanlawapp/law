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
import { WorkEntriesApiClient } from "@law/api-clients";
import { TaskDetail, WorkEntry } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { injectPaginatedList } from "../../shared/pagination/paginated-list";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { formatMinutes } from "../time/time-utils";
import { formatDate } from "../../shared/billing";
import { TaskCompletionService } from "./task-completion.service";
import { WORK_ENTRY_STATUS_LABELS } from "../../shared/models";

@Component({
  selector: "law-task-work-entries",
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
                {{ dateLabel(entry.workDate) }} ·
                {{
                  entry.user?.displayName ??
                    ("time.capture.unassigned" | translate)
                }}
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
export class TaskWorkEntriesComponent {
  private static nextId = 0;
  readonly headingId = `task-work-heading-${TaskWorkEntriesComponent.nextId++}`;
  readonly badgeClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly task = input.required<TaskDetail>();
  readonly disabled = input(false);
  private readonly api = inject(WorkEntriesApiClient);
  readonly list = injectPaginatedList<WorkEntry>({
    fetch: (request) => this.api.list({ taskId: this.task().id, ...request }),
  });
  readonly entries = this.list.items;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly hasMore = this.list.hasMore;
  readonly opening = signal(false);
  readonly formatMinutes = formatMinutes;
  readonly statusLabels = WORK_ENTRY_STATUS_LABELS;
  private readonly capture = inject(TaskCompletionService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      this.task();
      this.capture.workRevision();
      untracked(() => this.load(true));
      onCleanup(() => this.list.cancel());
    });
  }

  dateLabel(date: string): string {
    return formatDate(date, this.localization.language());
  }

  load(reset: boolean): void {
    if (!reset) return this.list.loadMore();
    this.list.clear();
    this.list.reset();
  }

  openWorkEntry(entry: WorkEntry): void {
    if (this.opening() || this.disabled()) return;
    this.opening.set(true);
    this.capture
      .openWorkEntry(entry)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.opening.set(false),
        error: () => {
          this.opening.set(false);
          this.error.set(true);
        },
      });
  }

  openQuickCapture(): void {
    if (this.opening() || this.disabled()) return;
    this.opening.set(true);
    this.capture
      .openQuickCapture(this.task())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.opening.set(false),
        error: () => {
          this.opening.set(false);
          this.error.set(true);
        },
      });
  }
}
