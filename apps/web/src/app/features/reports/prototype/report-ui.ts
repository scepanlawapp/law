import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  inject,
  input,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { formatMoney, formatDate, numberLocale } from "../../../shared/billing";
import { ChartDatum, ReportFilters } from "./report-model";
@Injectable({ providedIn: "root" })
export class ReportFormat {
  readonly localization = inject(LocalizationService);
  text(key: string) {
    return this.localization.translate(key);
  }
  money(minor: number) {
    return formatMoney(minor / 100, "RSD", this.localization.language());
  }
  date(value: string | null | undefined) {
    return value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value))
      ? formatDate(value, this.localization.language())
      : this.text("report.unavailable");
  }
  number(value: number) {
    return new Intl.NumberFormat(
      numberLocale(this.localization.language()),
    ).format(value);
  }
  percent(rate: number) {
    return new Intl.NumberFormat(numberLocale(this.localization.language()), {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(rate);
  }
  period(value: string) {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return this.text(value);
    return value.length === 7
      ? new Intl.DateTimeFormat(numberLocale(this.localization.language()), {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(value + "-01"))
      : this.date(value);
  }
}
@Component({
  selector: "law-report-kpi",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <article class="h-full rounded-xl border border-border bg-card p-5">
      <p class="text-sm text-muted-foreground">{{ label() | translate }}</p>
      <p
        class="mt-3 break-words text-2xl font-semibold tracking-tight"
        [class.text-primary]="emphasis()"
      >
        {{ count() ? format.number(value()) : format.money(value()) }}
      </p>
      @if (note()) {
        <p class="mt-2 text-sm text-muted-foreground">
          {{ note() | translate }}
        </p>
      }
    </article>
  `,
})
export class ReportKpiComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly count = input(false);
  readonly emphasis = input(false);
  readonly note = input("");
  readonly format = inject(ReportFormat);
}
@Component({
  selector: "law-report-chart",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, HlmTooltipImports],
  template: `
    <section class="h-full rounded-xl border border-border bg-card p-5">
      <h2 class="text-base font-semibold">{{ title() | translate }}</h2>
      <div class="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span class="flex items-center gap-2">
          <i class="size-2 rounded-full bg-primary" aria-hidden="true"></i>
          {{ firstLabel() | translate }}
        </span>
        @if (secondLabel()) {
          <span class="flex items-center gap-2">
            <i class="size-2 rounded-full bg-chart-2" aria-hidden="true"></i>
            {{ secondLabel() | translate }}
          </span>
        }
      </div>
      @if (!data().length) {
        <p class="py-12 text-center text-sm text-muted-foreground">
          {{ "report.empty" | translate }}
        </p>
      }
      <div
        class="mt-5 max-h-80 space-y-4 overflow-y-auto pr-2"
        [attr.aria-label]="title() | translate"
      >
        @for (item of data(); track item.label) {
          <div>
            <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
              @if (item.route) {
                <a
                  class="font-medium text-primary underline-offset-4 hover:underline"
                  [routerLink]="item.route"
                  [queryParams]="query()"
                >
                  {{ format.period(item.label) }}
                </a>
              } @else {
                <span>{{ format.period(item.label) }}</span>
              }
              <span class="shrink-0 tabular-nums text-muted-foreground">
                {{ format.money(item.first) }}
              </span>
            </div>
            <div
              tabindex="0"
              role="img"
              class="h-3 w-full rounded bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              [attr.aria-label]="tooltip(item, false)"
              [hlmTooltip]="tooltip(item, false)"
            >
              <div
                class="h-full rounded bg-primary"
                [style.width.%]="width(item.first)"
              ></div>
            </div>
            @if (secondLabel()) {
              <div
                tabindex="0"
                role="img"
                class="mt-1 h-3 w-full rounded bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                [attr.aria-label]="tooltip(item, true)"
                [hlmTooltip]="tooltip(item, true)"
              >
                <div
                  class="h-full rounded bg-chart-2"
                  [style.width.%]="width(item.second ?? 0)"
                ></div>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class ReportChartComponent {
  readonly title = input.required<string>();
  readonly firstLabel = input("report.shareCollected");
  readonly secondLabel = input("");
  readonly data = input.required<ChartDatum[]>();
  readonly query = input<Partial<ReportFilters>>({});
  readonly format = inject(ReportFormat);
  readonly max = computed(() =>
    Math.max(1, ...this.data().flatMap((d) => [d.first, d.second ?? 0])),
  );
  width(value: number) {
    return (value / this.max()) * 100;
  }
  tooltip(item: ChartDatum, second: boolean) {
    return `${this.format.period(item.label)} · ${this.format.text(second ? this.secondLabel() : this.firstLabel())}: ${this.format.money(second ? (item.second ?? 0) : item.first)}`;
  }
}
@Component({
  selector: "law-report-distribution",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="h-full rounded-xl border border-border bg-card p-5">
      <h2 class="text-base font-semibold">
        {{ "report.distribution" | translate }}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ "report.distributionHelp" | translate }}
      </p>
      <p class="mt-7 text-3xl font-semibold">{{ format.money(total()) }}</p>
      <div
        class="my-6 flex h-7 overflow-hidden rounded-full bg-muted"
        role="img"
        [attr.aria-label]="
          format.text('report.attributed') +
          ': ' +
          format.percent(ratio()) +
          '; ' +
          format.text('report.retained') +
          ': ' +
          format.percent(total() ? 1 - ratio() : 0)
        "
      >
        <div class="bg-primary" [style.width.%]="ratio() * 100"></div>
        <div
          class="bg-chart-2"
          [style.width.%]="total() ? (1 - ratio()) * 100 : 0"
        ></div>
      </div>
      <dl class="space-y-4 text-sm">
        <div class="flex justify-between gap-3">
          <dt>{{ "report.attributed" | translate }}</dt>
          <dd class="text-right tabular-nums">
            {{ format.money(attributed()) }} · {{ format.percent(ratio()) }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt>{{ "report.retained" | translate }}</dt>
          <dd class="text-right tabular-nums">
            {{ format.money(total() - attributed()) }} ·
            {{ format.percent(total() ? 1 - ratio() : 0) }}
          </dd>
        </div>
      </dl>
      <p class="mt-6 text-sm text-muted-foreground">
        {{ "report.retainedHelp" | translate }}
      </p>
    </section>
  `,
})
export class ReportDistributionComponent {
  readonly total = input.required<number>();
  readonly attributed = input.required<number>();
  readonly ratio = computed(() =>
    this.total() ? this.attributed() / this.total() : 0,
  );
  readonly format = inject(ReportFormat);
}
