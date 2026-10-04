import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { WorkEntriesApiClient } from "@law/api-clients";
import {
  ClientReference,
  WorkEntry,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronLeft, lucideChevronRight } from "@ng-icons/lucide";
import { NgTemplateOutlet } from "@angular/common";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { EMPTY, Observable, expand, reduce } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL_KEYS,
  TREATMENT_LABEL_KEYS,
  addDays,
  formatMinutes,
  isEditable,
  mondayOf,
  officeToday,
  sumMinutes,
  timeLocale,
  weekDays,
} from "./time-utils";

const PAGE_SIZE = 100;

export interface WeekDay {
  date: string;
  isToday: boolean;
  entries: WorkEntry[];
  minutes: number;
}

export interface ClientTotal {
  client: ClientReference;
  minutes: number;
}

@Component({
  selector: "law-my-time",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButton,
    HlmSpinner,
    NgIcon,
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  templateUrl: "./my-time.component.html",
})
export class MyTimeComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly auth = inject(AuthState);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly weekStart = signal(mondayOf(officeToday()));
  readonly entries = signal<WorkEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly today = officeToday();
  readonly formatMinutes = formatMinutes;
  readonly isEditable = isEditable;

  readonly weekEnd = computed(() => addDays(this.weekStart(), 6));
  readonly isCurrentWeek = computed(
    () => this.weekStart() === mondayOf(this.today),
  );

  readonly days = computed<WeekDay[]>(() =>
    weekDays(this.weekStart()).map((date) => {
      const entries = this.entries().filter((entry) => entry.workDate === date);
      return {
        date,
        isToday: date === this.today,
        entries,
        minutes: sumMinutes(entries),
      };
    }),
  );

  readonly weekMinutes = computed(() => sumMinutes(this.entries()));

  readonly clientTotals = computed<ClientTotal[]>(() => {
    const totals = new Map<string, ClientTotal>();
    for (const entry of this.entries()) {
      const current = totals.get(entry.client.id);
      if (current) current.minutes += entry.minutes ?? 0;
      else
        totals.set(entry.client.id, {
          client: entry.client,
          minutes: entry.minutes ?? 0,
        });
    }
    return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  });

  constructor() {
    effect(() => {
      const from = this.weekStart();
      const userId = this.auth.session()?.user.id;
      if (userId) untracked(() => this.load(userId, from));
    });
  }

  previousWeek(): void {
    this.weekStart.set(addDays(this.weekStart(), -7));
  }

  nextWeek(): void {
    this.weekStart.set(addDays(this.weekStart(), 7));
  }

  goToToday(): void {
    this.weekStart.set(mondayOf(officeToday()));
  }

  logTime(date?: string): void {
    this.capture
      .open({ mode: "create", workDate: date })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  edit(entry: WorkEntry): void {
    if (!isEditable(entry)) return;
    this.capture
      .open({ mode: "edit", entryId: entry.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  statusLabel(status: WorkEntryStatus): string {
    return STATUS_LABEL_KEYS[status];
  }

  statusClass(status: WorkEntryStatus): string {
    return STATUS_BADGE_CLASSES[status];
  }

  treatmentLabel(treatment: WorkEntryTreatment): string {
    return TREATMENT_LABEL_KEYS[treatment];
  }

  reload(): void {
    const userId = this.auth.session()?.user.id;
    if (userId) this.load(userId, this.weekStart());
  }

  dayLabel(date: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "numeric",
    }).format(new Date(`${date}T00:00:00Z`));
  }

  rangeLabel(): string {
    const format = new Intl.DateTimeFormat(this.locale(), {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${format.format(new Date(`${this.weekStart()}T00:00:00Z`))} – ${format.format(new Date(`${this.weekEnd()}T00:00:00Z`))}`;
  }

  private locale(): string {
    return timeLocale(this.localization.language());
  }

  private load(userId: string, from: string): void {
    this.loading.set(true);
    this.error.set(false);
    const to = addDays(from, 6);
    this.fetchAll(userId, from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // A newer navigation may have replaced the week while this loaded.
        next: (entries) => {
          if (this.weekStart() !== from) return;
          this.entries.set(entries);
          this.loading.set(false);
        },
        error: () => {
          if (this.weekStart() !== from) return;
          this.entries.set([]);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  private fetchAll(
    userId: string,
    from: string,
    to: string,
  ): Observable<WorkEntry[]> {
    const page = (number: number) =>
      this.api.list({
        userIds: [userId],
        from,
        to,
        page: number,
        pageSize: PAGE_SIZE,
      });
    return page(1).pipe(
      expand((response) =>
        response.meta.page < response.meta.totalPages
          ? page(response.meta.page + 1)
          : EMPTY,
      ),
      reduce((all, response) => [...all, ...response.items], [] as WorkEntry[]),
    );
  }
}
