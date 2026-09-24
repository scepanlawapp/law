import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router, RouterLink } from "@angular/router";
import { FinanceOverview, BillingSuggestion } from "@law/api-interfaces";
import { FinancialsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { BillingEntryDialogService } from "../finance-work-review/billing-entry-dialog.service";

@Component({
  selector: "law-finance-overview",
  standalone: true,
  templateUrl: "./finance-overview.component.html",
  imports: [HlmButton, HlmSpinner, RouterLink, TranslatePipe],
})
export class FinanceOverviewComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly entryDialog = inject(BillingEntryDialogService);

  readonly overview = signal<FinanceOverview | null>(null);
  readonly attention = signal<BillingSuggestion[]>([]);
  readonly overviewLoading = signal(true);
  readonly attentionLoading = signal(true);
  readonly overviewError = signal(false);
  readonly attentionError = signal(false);
  readonly loading = computed(
    () => this.overviewLoading() || this.attentionLoading(),
  );
  readonly error = computed(
    () => this.overviewError() && this.attentionError(),
  );
  readonly overviewUnavailable = computed(() => this.overviewError());

  constructor() {
    this.load();
  }

  load(): void {
    this.overviewLoading.set(true);
    this.attentionLoading.set(true);
    this.overviewError.set(false);
    this.attentionError.set(false);
    this.overview.set(null);
    this.attention.set([]);
    this.api
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.overview.set(value);
          this.overviewLoading.set(false);
        },
        error: () => {
          this.overviewLoading.set(false);
          this.overviewError.set(true);
        },
      });
    this.api
      .candidates({ page: 1, pageSize: 5 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.attention.set(value.items);
          this.attentionLoading.set(false);
        },
        error: () => {
          this.attentionLoading.set(false);
          this.attentionError.set(true);
        },
      });
  }

  currencyAmount(
    items: Array<{ currency: string; amount: string }> | undefined,
  ): string {
    if (!items?.length) return "—";
    return items
      .map((item) => this.formatCurrency(item.amount, item.currency))
      .join(" · ");
  }

  formatCurrency(amount: string, currency: string): string {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  review(): void {
    void this.router.navigate(["/finance/work-review"]);
  }

  addWork(): void {
    this.entryDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => undefined);
  }

  reviewCandidate(candidateKey: string): void {
    void this.router.navigate(["/finance/work-review"], {
      queryParams: { candidateKey },
    });
  }

  externalUnpaid(): string {
    const values = this.overview()?.externallyUnpaidByCurrency;
    return values?.length
      ? values
          .map((item) => this.formatCurrency(item.amount, item.currency))
          .join(" · ")
      : this.localization.translate("finance.unavailable");
  }

  private locale(): string {
    return this.localization.language() === "SR" ? "sr-Latn-RS" : "en-US";
  }
}
