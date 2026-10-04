import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { BillingReportsApiClient } from "@law/api-clients";
import type {
  ProfitabilityReport,
  ProfitabilityRow,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTable,
  HlmTableContainer,
  HlmTr,
} from "@spartan-ng/helm/table";
import {
  HlmTabs,
  HlmTabsContent,
  HlmTabsList,
  HlmTabsTrigger,
} from "@spartan-ng/helm/tabs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  formatDate,
  formatHours,
  formatMoney,
  previousMonth,
} from "../../../shared/billing";
import { createSelectItemToString } from "../../../shared/utils";
import { addDays, isIsoDate, officeToday } from "../../time/time-utils";

export type RangePreset =
  | "LAST_MONTH"
  | "THIS_MONTH"
  | "LAST_3_MONTHS"
  | "CUSTOM";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * The date range of a preset, in the office time zone. `today` is a
 * YYYY-MM-DD office calendar day. Custom has no computed range.
 */
export function presetRange(
  preset: Exclude<RangePreset, "CUSTOM">,
  today: string,
): DateRange {
  const month = today.slice(0, 7);
  switch (preset) {
    case "LAST_MONTH":
      return {
        from: `${previousMonth(month)}-01`,
        to: addDays(`${month}-01`, -1),
      };
    case "THIS_MONTH":
      return { from: `${month}-01`, to: today };
    case "LAST_3_MONTHS":
      return { from: `${previousMonth(previousMonth(month))}-01`, to: today };
  }
}

/** A decimal string split into an integer of all its digits and its scale. */
function parseDecimal(value: string): { units: bigint; scale: number } | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[3] ?? "";
  const units = BigInt(match[2] + fraction);
  return { units: match[1] ? -units : units, scale: fraction.length };
}

/**
 * True when `effective` is strictly below `target`. Both are decimal strings,
 * compared as scaled integers (no floating point), and `false` when either is
 * missing or not a decimal.
 */
export function isBelowTarget(
  effective: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (effective == null || target == null) return false;
  const a = parseDecimal(effective);
  const b = parseDecimal(target);
  if (!a || !b) return false;
  const scale = Math.max(a.scale, b.scale);
  const scaledA = a.units * BigInt(10) ** BigInt(scale - a.scale);
  const scaledB = b.units * BigInt(10) ** BigInt(scale - b.scale);
  return scaledA < scaledB;
}

/** Billed share of logged time as a whole percent, `null` without logged time. */
export function utilizationPercent(
  loggedMinutes: number,
  billedMinutes: number,
): number | null {
  if (loggedMinutes <= 0) return null;
  return Math.round((billedMinutes / loggedMinutes) * 100);
}

const PRESET_OPTIONS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: "LAST_MONTH", label: "reports.profitability.presetLastMonth" },
  { value: "THIS_MONTH", label: "reports.profitability.presetThisMonth" },
  { value: "LAST_3_MONTHS", label: "reports.profitability.presetLast3Months" },
  { value: "CUSTOM", label: "reports.profitability.presetCustom" },
];

@Component({
  selector: "law-profitability",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    HlmTabs,
    HlmTabsContent,
    HlmTabsList,
    HlmTabsTrigger,
    TranslatePipe,
  ],
  templateUrl: "./profitability.component.html",
})
export class ProfitabilityComponent {
  private readonly api = inject(BillingReportsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  readonly presetOptions = PRESET_OPTIONS;
  readonly presetItemToString = createSelectItemToString(
    PRESET_OPTIONS,
    (key) => this.localization.translate(key),
  );
  readonly isBelowTarget = isBelowTarget;
  readonly utilizationPercent = utilizationPercent;

  readonly preset = signal<RangePreset>("LAST_MONTH");
  readonly tab = signal("clients");
  readonly customFrom = new FormControl("", { nonNullable: true });
  readonly customTo = new FormControl("", { nonNullable: true });
  readonly rangeInvalid = signal(false);

  readonly report = signal<ProfitabilityReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly rangeLabel = computed(() => {
    const report = this.report();
    if (!report) return "";
    const language = this.localization.language();
    return `${formatDate(report.from, language)} – ${formatDate(report.to, language)}`;
  });

  constructor() {
    this.loadPreset("LAST_MONTH");
  }

  setPreset(value: RangePreset | null | undefined): void {
    if (!value) return;
    this.preset.set(value);
    this.rangeInvalid.set(false);
    if (value === "CUSTOM") {
      if (!this.customFrom.value && !this.customTo.value) {
        const range = presetRange("LAST_MONTH", officeToday());
        this.customFrom.setValue(range.from);
        this.customTo.setValue(range.to);
      }
      return;
    }
    this.loadPreset(value);
  }

  applyCustom(): void {
    const from = this.customFrom.value;
    const to = this.customTo.value;
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      this.rangeInvalid.set(true);
      return;
    }
    this.rangeInvalid.set(false);
    this.load({ from, to });
  }

  reload(): void {
    if (this.preset() === "CUSTOM") this.applyCustom();
    else this.loadPreset(this.preset() as Exclude<RangePreset, "CUSTOM">);
  }

  money(amount: string | null, currency: string): string {
    return amount === null
      ? "—"
      : formatMoney(amount, currency, this.localization.language());
  }

  hours(minutes: number): string {
    return formatHours(minutes, this.localization.language());
  }

  rate(report: ProfitabilityReport, row: ProfitabilityRow): string {
    return row.effectiveHourlyRate === null
      ? "—"
      : this.money(row.effectiveHourlyRate, report.internalCurrency);
  }

  utilization(loggedMinutes: number, billedMinutes: number): string {
    const percent = utilizationPercent(loggedMinutes, billedMinutes);
    return percent === null ? "—" : `${percent} %`;
  }

  private loadPreset(preset: Exclude<RangePreset, "CUSTOM">): void {
    this.load(presetRange(preset, officeToday()));
  }

  private load(range: DateRange): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .profitability(range.from, range.to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (requestId !== this.requestId) return;
          this.report.set(report);
          this.loading.set(false);
        },
        error: () => {
          if (requestId !== this.requestId) return;
          this.report.set(null);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
