import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  BillingReportsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import {
  MonthEndPrecheck,
  MonthEndRunResult,
  WorkEntry,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  formatMonthLabel,
  isMonth,
  officeMonth,
  previousMonth,
} from "../../shared/billing";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL_KEYS,
  TREATMENT_LABEL_KEYS,
  formatMinutes,
  formatWorkDate,
} from "../time/time-utils";
import { WriteOffDialogService } from "../time/write-off-dialog/write-off-dialog.service";

type StatementRow = MonthEndRunResult["statements"][number];

/**
 * Owner-only month-end billing: step 1 clears the open entries of the month
 * (confirm or write off), step 2 generates the draft statements.
 */
@Component({
  selector: "law-month-end",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
  templateUrl: "./month-end.component.html",
})
export class MonthEndComponent {
  private readonly reports = inject(BillingReportsApiClient);
  private readonly entriesApi = inject(WorkEntriesApiClient);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly statusBadgeClasses = STATUS_BADGE_CLASSES;
  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly formatMinutes = formatMinutes;

  /** The billed month, `YYYY-MM`; the previous month unless changed. */
  readonly month = new FormControl(previousMonth(officeMonth()), {
    nonNullable: true,
    validators: [
      Validators.required,
      (control) => (isMonth(control.value) ? null : { month: true }),
    ],
  });

  readonly precheck = signal<MonthEndPrecheck | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly busyEntryId = signal<string | null>(null);
  readonly running = signal(false);
  readonly result = signal<MonthEndRunResult | null>(null);

  readonly clients = computed(() => this.precheck()?.clients ?? []);
  readonly openCount = computed(() =>
    this.clients().reduce((total, group) => total + group.open.length, 0),
  );
  /** The precheck of the picked month is on screen, so drafts may be generated. */
  readonly ready = computed(
    () => this.precheck() !== null && !this.loading() && !this.error(),
  );

  constructor() {
    this.month.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.result.set(null);
        this.loadPrecheck();
      });
    this.loadPrecheck();
  }

  monthLabel(): string {
    return isMonth(this.month.value)
      ? formatMonthLabel(this.month.value, this.localization.language())
      : "";
  }

  workDateLabel(date: string): string {
    return formatWorkDate(date, this.localization.language());
  }

  reload(): void {
    this.loadPrecheck();
  }

  // ----------------------------------------------------------- entry actions

  /** A proposed entry is confirmed; a confirmed one still needs its treatment. */
  confirm(entry: WorkEntry): void {
    const request =
      entry.status === "PROPOSED"
        ? this.capture.open({
            mode: "confirm-timer",
            entryId: entry.id,
            clientId: entry.client.id,
            caseId: entry.case?.id,
            minutes: entry.minutes ?? undefined,
            description: entry.description,
            workDate: entry.workDate,
          })
        : this.capture.open({ mode: "edit", entryId: entry.id });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved) => {
      if (saved) this.loadPrecheck();
    });
  }

  writeOff(entry: WorkEntry): void {
    this.writeOffDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reason) => {
        if (!reason) return;
        this.busyEntryId.set(entry.id);
        this.entriesApi
          .writeOff(entry.id, { reason })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.busyEntryId.set(null);
              this.toast.success(
                this.localization.translate("time.writeOff.done"),
              );
              this.loadPrecheck();
            },
            error: () => {
              this.busyEntryId.set(null);
              this.toast.error(
                this.localization.translate("time.writeOff.error"),
              );
            },
          });
      });
  }

  // ------------------------------------------------------------------- run

  generate(): void {
    if (!this.ready() || this.running()) return;
    const month = this.month.value;
    const open = this.openCount();
    if (open === 0) {
      this.run(month);
      return;
    }
    this.confirmDialog
      .confirm({
        title: this.localization.translate("finance.monthEnd.confirmTitle"),
        message: this.localization.translate(
          "finance.monthEnd.confirmMessage",
          {
            count: open,
          },
        ),
        confirmText: this.localization.translate("finance.monthEnd.generate"),
        variant: "warning",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.run(month);
      });
  }

  /**
   * `created`, `updated`, `attachedToFee` (covered work joined the existing
   * fee line, no new line) or `noChanges` when nothing happened. A conflict
   * row is rendered separately.
   */
  outcomeKey(row: StatementRow): string {
    if (row.created) return "finance.monthEnd.created";
    if (row.addedLines > 0) return "finance.monthEnd.updated";
    return row.attachedEntries > 0
      ? "finance.monthEnd.attachedToFee"
      : "finance.monthEnd.noChanges";
  }

  private run(month: string): void {
    this.running.set(true);
    // The month must not change under a run in flight.
    this.month.disable({ emitEvent: false });
    this.reports
      .runMonthEnd(month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.running.set(false);
          this.month.enable({ emitEvent: false });
          // The month may have been changed while the run was in flight.
          if (this.month.value === month) this.result.set(result);
        },
        error: () => {
          this.running.set(false);
          this.month.enable({ emitEvent: false });
          this.toast.error(
            this.localization.translate("finance.monthEnd.runError"),
          );
        },
      });
  }

  private loadPrecheck(): void {
    const requestId = ++this.requestId;
    this.precheck.set(null);
    this.error.set(false);
    if (!this.month.valid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.reports
      .precheck(this.month.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (precheck) => {
          if (requestId !== this.requestId) return;
          this.precheck.set(precheck);
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
