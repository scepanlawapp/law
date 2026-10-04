import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { BillingReportsApiClient } from "@law/api-clients";
import type { RetainerUsage } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmProgressImports } from "@spartan-ng/helm/progress";
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
import { EMPTY, catchError, filter, switchMap, tap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  canManageBilling,
  formatHours,
  formatMoney,
  isForbidden,
  isMonth,
  officeMonth,
  usagePercent,
  usageState,
} from "../../shared/billing";
import type { UsageState } from "../../shared/billing";

interface UsageRow {
  usage: RetainerUsage;
  percent: number | null;
  state: UsageState;
}

/** Highest usage first; agreements without an hour cap go last, by client name. */
export function sortByUsage(items: readonly RetainerUsage[]): UsageRow[] {
  return items
    .map((usage) => {
      const percent = usagePercent(usage);
      return { usage, percent, state: usageState(percent) };
    })
    .sort((a, b) => {
      if (a.percent === null && b.percent === null) {
        return a.usage.client.displayName.localeCompare(
          b.usage.client.displayName,
        );
      }
      if (a.percent === null) return 1;
      if (b.percent === null) return -1;
      return b.percent - a.percent;
    });
}

@Component({
  selector: "law-finance-retainers",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmInput,
    HlmProgressImports,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
  templateUrl: "./retainers.component.html",
  host: { class: "block min-w-0" },
})
export class FinanceRetainersComponent {
  private readonly api = inject(BillingReportsApiClient);
  private readonly auth = inject(AuthState);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly month = new FormControl(officeMonth(), { nonNullable: true });
  private readonly monthValue = signal(this.month.value);

  readonly items = signal<RetainerUsage[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly forbidden = signal(false);

  readonly rows = computed(() => sortByUsage(this.items()));
  readonly canManage = computed(() =>
    canManageBilling(this.auth.activeWorkspace()?.role),
  );

  constructor() {
    this.month.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.monthValue.set(value));

    toObservable(this.monthValue)
      .pipe(
        filter(isMonth),
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        // switchMap drops a slow response for a month the user already left.
        switchMap((month) =>
          this.api.usage(month).pipe(
            catchError((error) => {
              this.items.set([]);
              this.loading.set(false);
              if (isForbidden(error)) this.forbidden.set(true);
              else this.error.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.items.set(items);
        this.loading.set(false);
      });
  }

  hours(minutes: number): string {
    return `${formatHours(minutes, this.localization.language())} h`;
  }

  money(amount: string, currency: string): string {
    return formatMoney(amount, currency, this.localization.language());
  }

  /** The bar stops at 100 %; the label keeps showing the real overrun. */
  barValue(percent: number | null): number {
    return Math.min(100, this.percentLabel(percent));
  }

  percentLabel(percent: number | null): number {
    return Math.round(percent ?? 0);
  }
}
