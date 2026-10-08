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
import { Subscription } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  formatMinutes,
  formatWorkDate,
  STATUS_LABEL_KEYS,
} from "../time/time-utils";
import { TaskCompletionService } from "./task-completion.service";

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
          <li class="grid gap-1 rounded-md border border-border p-3">
            <span class="text-sm font-medium break-words">
              {{ entry.title }}
            </span>
            <span class="text-sm text-muted-foreground">
              {{ dateLabel(entry.workDate) }} · {{ entry.user.displayName }}
            </span>
            <div class="flex flex-wrap items-center gap-2 text-sm">
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
            </div>
            @if (entry.description) {
              <p
                class="text-sm text-muted-foreground whitespace-pre-wrap break-words"
              >
                {{ entry.description }}
              </p>
            }
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
  readonly entries = signal<WorkEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly hasMore = signal(false);
  readonly opening = signal(false);
  readonly formatMinutes = formatMinutes;
  readonly statusLabels = STATUS_LABEL_KEYS;
  private readonly api = inject(WorkEntriesApiClient);
  private readonly capture = inject(TaskCompletionService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private page = 0;

  constructor() {
    effect((onCleanup) => {
      this.task();
      this.capture.workRevision();
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
      .list({ taskId: this.task().id, page, pageSize: 50 })
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
