import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router, RouterLink } from "@angular/router";
import { FinanceOverview, BillingSuggestion } from "@law/api-interfaces";
import { FinancialsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-finance-overview",
  standalone: true,
  templateUrl: "./finance-overview.component.html",
  imports: [
    HlmButton,
    HlmSpinner,
    RouterLink,
    TranslatePipe,
  ],
})
export class FinanceOverviewComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly overview = signal<FinanceOverview | null>(null);
  readonly attention = signal<BillingSuggestion[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly overviewUnavailable = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.overview.set(value);
          this.overviewUnavailable.set(false);
        },
        error: () => this.overviewUnavailable.set(true),
      });
    this.api
      .candidates({ page: 1, pageSize: 5 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.attention.set(value.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  currencyAmount(items: Array<{ currency: string; amount: string }> | undefined): string {
    if (!items?.length) return "—";
    return items.map((item) => this.formatCurrency(item.amount, item.currency)).join(" · ");
  }

  formatCurrency(amount: string, currency: string): string {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: "medium" }).format(new Date(value));
  }

  review(): void {
    void this.router.navigate(["/finance/work-review"]);
  }

  private locale(): string {
    return navigator.language.startsWith("sr") ? "sr-Latn-RS" : "en-US";
  }
}
