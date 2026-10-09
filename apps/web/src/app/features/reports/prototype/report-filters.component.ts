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
const control = (value = "") => new FormControl(value, { nonNullable: true });
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
            <button
              hlmBtn
              type="button"
              size="sm"
              variant="outline"
              (click)="preset('current')"
            >
              {{ "report.current" | translate }}
            </button>
            <button
              hlmBtn
              type="button"
              size="sm"
              variant="ghost"
              (click)="preset('last')"
            >
              {{ "report.last" | translate }}
            </button>
            <button
              hlmBtn
              type="button"
              size="sm"
              variant="ghost"
              (click)="preset('three')"
            >
              {{ "report.three" | translate }}
            </button>
            <button
              hlmBtn
              type="button"
              size="sm"
              variant="ghost"
              (click)="preset('year')"
            >
              {{ "report.year" | translate }}
            </button>
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
          {{ "report.basisHelp." + value().basis | translate }}
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
    basis: control("work"),
    member: control(),
    client: control(),
    caseId: control(),
    status: control(),
    sharing: control(),
    workStatus: control(),
    search: control(),
    group: control("week"),
  });
  readonly basisOptions = ["work", "invoice", "collection"].map((value) => ({
    value,
    label: `report.basis.${value}`,
  }));
  readonly groupOptions = ["day", "week", "month"].map((value) => ({
    value,
    label: `report.group.${value}`,
  }));
  readonly statusOptions = this.options([
    "NotInvoiced",
    "PartiallyCollected",
    "Uncollected",
    "FullyCollected",
    "RequiresConfiguration",
  ]);
  readonly sharingOptions = this.options(["configured", "excluded", "missing"]);
  readonly workOptions = this.options(["completed", "planned"]);
  readonly members = computed(() => [
    { value: "all", label: "report.all" },
    ...this.data().members.map((m) => ({ value: m.id, label: m.name })),
  ]);
  readonly clients = computed(() => [
    { value: "all", label: "report.all" },
    ...[
      ...new Map(
        this.data().records.map((r) => [r.clientId, r.client]),
      ).entries(),
    ].map(([value, label]) => ({ value, label })),
  ]);
  readonly cases = computed(() => [
    { value: "all", label: "report.all" },
    ...[
      ...new Map(
        this.data().records.map((r) => [r.caseId, r.caseName]),
      ).entries(),
    ].map(([value, label]) => ({ value, label })),
  ]);
  constructor() {
    effect(() => {
      const value = this.value();
      this.form.setValue(
        {
          ...value,
          ...Object.fromEntries(
            [
              "member",
              "client",
              "caseId",
              "status",
              "sharing",
              "workStatus",
            ].map((key) => [key, value[key as keyof ReportFilters] || "all"]),
          ),
        },
        { emitEvent: false },
      );
    });
    this.form.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() =>
        this.changed.emit(
          Object.fromEntries(
            Object.entries(this.form.getRawValue()).map(([key, value]) => [
              key,
              value === "all" ? "" : value,
            ]),
          ) as unknown as ReportFilters,
        ),
      );
  }
  options(values: string[]) {
    return [
      { value: "all", label: "report.all" },
      ...values.map((value) => ({ value, label: `report.enum.${value}` })),
    ];
  }
  chooseMonth(month: string) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      this.form.patchValue(monthRange(month));
  }
  move(offset: number) {
    if (validRange(this.value().from, this.value().to))
      this.chooseMonth(shiftMonth(this.value().from.slice(0, 7), offset));
  }
  preset(kind: string) {
    const current = officeMonth();
    const end = monthRange(current);
    this.form.patchValue(
      kind === "last"
        ? monthRange(shiftMonth(current, -1))
        : {
            ...end,
            to: kind === "year" ? officeToday() : end.to,
            from:
              kind === "year"
                ? current.slice(0, 4) + "-01-01"
                : kind === "three"
                  ? monthRange(shiftMonth(current, -2)).from
                  : end.from,
          },
    );
  }
}
