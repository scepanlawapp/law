import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { officeToday } from "../../time/time-utils";
import { officeMonth } from "../../../shared/billing";
import { ReportDataset, ReportFilters } from "./report-model";
import { monthRange, shiftMonth, validRange } from "./report-selectors";
import { ReportSelectComponent } from "./report-select.component";
import {
  ALL_OPTION_VALUE,
  REPORT_COLLECTION_STATUS_LABELS,
  REPORT_DATE_BASIS_HELP_LABELS,
  REPORT_DATE_BASIS_LABELS,
  REPORT_GROUP_LABELS,
  REPORT_PERIOD_PRESET_LABELS,
  REPORT_SHARING_LABELS,
  REPORT_WORK_STATUS_LABELS,
  SelectOption,
  filterOptionsFrom,
  optionsFrom,
} from "../../../shared/models";
import {
  ReportDateBasis,
  ReportGroup,
  ReportPeriodPreset,
} from "../../../shared/models";

const ALL_LABEL = "report.all";
const control = (value = "") => new FormControl(value, { nonNullable: true });
const allOption = (): SelectOption => ({
  value: ALL_OPTION_VALUE,
  label: ALL_LABEL,
});
@Component({
  selector: "law-report-filters",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmLabel,
    TranslatePipe,
    ReportSelectComponent,
  ],
  template: `
    <section
      class="rounded-xl border border-border bg-card p-5"
      [attr.aria-label]="'report.filters' | translate"
    >
      <form [formGroup]="form" class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label hlmLabel for="report-month">
              {{ "report.month" | translate }}
            </label>
            <div class="mt-2 flex items-center gap-1">
              <button
                hlmBtn
                variant="outline"
                size="icon"
                type="button"
                (click)="move(-1)"
                [attr.aria-label]="'report.previous' | translate"
              >
                ‹
              </button>
              <input
                hlmInput
                id="report-month"
                type="month"
                class="w-44"
                [value]="value().from.slice(0, 7)"
                (change)="chooseMonth($any($event.target).value)"
              />
              <button
                hlmBtn
                variant="outline"
                size="icon"
                type="button"
                (click)="move(1)"
                [attr.aria-label]="'report.next' | translate"
              >
                ›
              </button>
            </div>
          </div>
          <div>
            <label hlmLabel for="report-from">
              {{ "report.from" | translate }}
            </label>
            <input
              hlmInput
              id="report-from"
              type="date"
              formControlName="from"
              class="mt-2 w-44"
            />
          </div>
          <div>
            <label hlmLabel for="report-to">
              {{ "report.to" | translate }}
            </label>
            <input
              hlmInput
              id="report-to"
              type="date"
              formControlName="to"
              class="mt-2 w-44"
            />
          </div>
          <div class="flex flex-wrap gap-1">
            @for (preset of presetOptions; track preset.value) {
              <button
                hlmBtn
                type="button"
                size="sm"
                [variant]="$first ? 'outline' : 'ghost'"
                (click)="applyPreset(preset.value)"
              >
                {{ preset.label | translate }}
              </button>
            }
          </div>
        </div>
        @if (!validRange(value().from, value().to)) {
          <p role="alert" class="text-sm text-destructive">
            {{ "report.invalidRange" | translate }}
          </p>
        }
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <law-report-select
            controlId="report-basis"
            label="report.basis"
            [control]="form.controls.basis"
            [options]="basisOptions"
          />
          @if (!personal()) {
            <law-report-select
              controlId="report-member"
              label="report.attorney"
              [control]="form.controls.member"
              [options]="members()"
            />
          }
          <law-report-select
            controlId="report-client"
            label="report.client"
            [control]="form.controls.client"
            [options]="clients()"
          />
          <law-report-select
            controlId="report-case"
            label="report.case"
            [control]="form.controls.caseId"
            [options]="cases()"
          />
          <law-report-select
            controlId="report-status"
            label="report.collectionStatus"
            [control]="form.controls.status"
            [options]="statusOptions"
          />
          <law-report-select
            controlId="report-work-status"
            label="report.workStatus"
            [control]="form.controls.workStatus"
            [options]="workOptions"
          />
          <law-report-select
            controlId="report-sharing"
            label="report.sharing"
            [control]="form.controls.sharing"
            [options]="sharingOptions"
          />
          @if (grouping()) {
            <law-report-select
              controlId="report-group"
              label="report.group"
              [control]="form.controls.group"
              [options]="groupOptions"
            />
          }
        </div>
        <p class="text-sm leading-relaxed text-muted-foreground">
          {{ basisHelpLabels[value().basis] | translate }}
        </p>
        @if (value().member) {
          <p class="text-sm text-muted-foreground">
            {{ "report.memberFilterHelp" | translate }}
          </p>
        }
        <p class="text-sm text-muted-foreground">
          {{ "report.balanceHelp" | translate }}
        </p>
      </form>
    </section>
  `,
})
export class ReportFiltersComponent {
  readonly value = input.required<ReportFilters>();
  readonly data = input.required<ReportDataset>();
  readonly personal = input(false);
  readonly grouping = input(true);
  readonly changed = output<ReportFilters>();
  readonly validRange = validRange;
  readonly form = new FormGroup({
    from: control(),
    to: control(),
    basis: control(ReportDateBasis.WORK),
    member: control(),
    client: control(),
    caseId: control(),
    status: control(),
    sharing: control(),
    workStatus: control(),
    search: control(),
    group: control(ReportGroup.WEEK),
  });
  readonly basisHelpLabels = REPORT_DATE_BASIS_HELP_LABELS;
  readonly presetOptions = optionsFrom(REPORT_PERIOD_PRESET_LABELS);
  readonly basisOptions = optionsFrom(REPORT_DATE_BASIS_LABELS);
  readonly groupOptions = optionsFrom(REPORT_GROUP_LABELS);
  readonly statusOptions = filterOptionsFrom(
    REPORT_COLLECTION_STATUS_LABELS,
    ALL_LABEL,
  );
  readonly sharingOptions = filterOptionsFrom(REPORT_SHARING_LABELS, ALL_LABEL);
  readonly workOptions = filterOptionsFrom(
    REPORT_WORK_STATUS_LABELS,
    ALL_LABEL,
  );
  readonly members = computed(() => [
    allOption(),
    ...this.data().members.map((m) => ({ value: m.id, label: m.name })),
  ]);
  readonly clients = computed(() => [
    allOption(),
    ...[
      ...new Map(
        this.data().records.map((r) => [r.clientId, r.client]),
      ).entries(),
    ].map(([value, label]) => ({ value, label })),
  ]);
  readonly cases = computed(() => [
    allOption(),
    ...[
      ...new Map(
        this.data().records.map((r) => [r.caseId, r.caseName]),
      ).entries(),
    ].map(([value, label]) => ({ value, label })),
  ]);
  constructor() {
    effect(() => {
      this.form.setValue(this.value(), { emitEvent: false });
    });
    this.form.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() =>
        this.changed.emit(this.form.getRawValue() as ReportFilters),
      );
  }
  chooseMonth(month: string) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      this.form.patchValue(monthRange(month));
  }
  move(offset: number) {
    if (validRange(this.value().from, this.value().to))
      this.chooseMonth(shiftMonth(this.value().from.slice(0, 7), offset));
  }
  applyPreset(preset: ReportPeriodPreset) {
    const current = officeMonth();
    const end = monthRange(current);
    this.form.patchValue(
      preset === ReportPeriodPreset.LAST
        ? monthRange(shiftMonth(current, -1))
        : {
            ...end,
            to: preset === ReportPeriodPreset.YEAR ? officeToday() : end.to,
            from:
              preset === ReportPeriodPreset.YEAR
                ? current.slice(0, 4) + "-01-01"
                : preset === ReportPeriodPreset.THREE
                  ? monthRange(shiftMonth(current, -2)).from
                  : end.from,
          },
    );
  }
}
